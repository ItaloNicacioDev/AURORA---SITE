// ══════════════════════════════════════════════════════════
//  Program.cs  —  Aurora Web API + Static Files
//  Backend de contas de usuário: cadastro, verificação de
//  e-mail, consentimento LGPD, ativação e integração Explorar.
//  Padrão do projeto: Minimal API + Npgsql (SQL cru) + DDL no startup.
// ══════════════════════════════════════════════════════════
using Npgsql;
using System.Text;
using System.Security.Cryptography;

var builder = WebApplication.CreateBuilder(args);
var app     = builder.Build();

// ── Servir arquivos estáticos (css, js, imagens em wwwroot) ─
app.UseStaticFiles();

// ── Configurações ─────────────────────────────────────────
// String de conexão — ajuste a senha (SUA_SENHA) conforme seu container
const string connStr =
    "Host=localhost;Port=5432;Database=aurora;Username=postgres;Password=1205";

// Segredo usado para assinar os tokens de sessão (altere em produção)
const string TokenSecret = "aurora-helix-chave-super-secreta-altere-me";

// Regras de negócio
const int    SenhaMinLength          = 8;
const int    VerificacaoExpiracaoH   = 24;   // horas
const string TermosVersao            = "1.0"; // versão atual dos termos/contrato

// Páginas HTML (estão em wwwroot/html)
var pages = new[] { "home", "explorar", "registros", "sobre", "cadastro", "comprar" };

string PagePath(string name) =>
    Path.Combine(app.Environment.ContentRootPath, "wwwroot", "html", name + ".html");

// ── Criação/alteração do banco (best-effort) ao iniciar ──
try
{
    await using var conn = new NpgsqlConnection(connStr);
    await conn.OpenAsync();
    await using var cmd = new NpgsqlCommand("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            nome TEXT,
            criado_em TIMESTAMP NOT NULL DEFAULT now()
        );
        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS verificado_em TIMESTAMP;
        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_verificacao TEXT;
        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_verificacao_expira_em TIMESTAMP;

        CREATE TABLE IF NOT EXISTS cadastro (
            id SERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            data_nasc TEXT,
            nacionalidade TEXT,
            descendencia TEXT,
            ano_morte TEXT,
            informacoes_add TEXT,
            sequencia_dna TEXT
        );
        ALTER TABLE cadastro ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id);

        CREATE TABLE IF NOT EXISTS consentimentos (
            id SERIAL PRIMARY KEY,
            usuario_id INT NOT NULL REFERENCES usuarios(id),
            aceito_em TIMESTAMP NOT NULL DEFAULT now(),
            versao_termos TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ativo'
        );
        """, conn);
    await cmd.ExecuteNonQueryAsync();
}
catch
{
    // Não interrompe a aplicação se o banco não estiver disponível
}

// ── Rota raiz → home ────────────────────────────────────────
app.MapGet("/", () =>
    Results.File(PagePath("home"), "text/html; charset=utf-8"));

// ── Demais páginas: /explorar.html, /registros.html, etc. ──
app.MapGet("/{page}.html", (string page) =>
{
    if (!pages.Contains(page) || !File.Exists(PagePath(page)))
        return Results.NotFound();
    return Results.File(PagePath(page), "text/html; charset=utf-8");
});

// ── POST /api/auth/registro ───────────────────────────────
// Cria a conta (inativa/pendente), gera token de verificação e
// registra o consentimento dos termos (obrigatório).
app.MapPost("/api/auth/registro", async (RegistroDto dto, HttpContext ctx) =>
{
    // Validação de entrada
    if (string.IsNullOrWhiteSpace(dto.Email) || !ValidarEmail(dto.Email))
        return Results.BadRequest(new { erro = "Informe um e-mail válido." });
    if (string.IsNullOrWhiteSpace(dto.Senha) || dto.Senha.Length < SenhaMinLength)
        return Results.BadRequest(new { erro = $"A senha deve ter ao menos {SenhaMinLength} caracteres." });
    if (dto.AceiteTermos != true)
        return Results.BadRequest(new { erro = "É necessário aceitar os termos para concluir o cadastro." });

    var email   = dto.Email.Trim().ToLowerInvariant();
    var nome    = (dto.Nome?.Trim()) ?? "";
    var versao  = string.IsNullOrWhiteSpace(dto.VersaoTermos) ? TermosVersao : dto.VersaoTermos!.Trim();

    try
    {
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();

        // E-mail já cadastrado?
        await using (var chk = new NpgsqlCommand("SELECT 1 FROM usuarios WHERE email = @email", conn))
        {
            chk.Parameters.AddWithValue("@email", email);
            if (await chk.ExecuteScalarAsync() != null)
                return Results.Conflict(new { erro = "Este e-mail já está cadastrado." });
        }

        var token  = GerarTokenVerificacao();
        var expira = DateTime.UtcNow.AddHours(VerificacaoExpiracaoH);

        await using var ins = new NpgsqlCommand("""
            INSERT INTO usuarios (email, senha_hash, nome, token_verificacao, token_verificacao_expira_em)
            VALUES (@email, @senha_hash, @nome, @token, @expira)
            """, conn);
        ins.Parameters.AddWithValue("@email", email);
        ins.Parameters.AddWithValue("@senha_hash", HashPassword(dto.Senha));
        ins.Parameters.AddWithValue("@nome", (object?)nome == "" ? DBNull.Value : nome);
        ins.Parameters.AddWithValue("@token", token);
        ins.Parameters.AddWithValue("@expira", expira);
        await ins.ExecuteNonQueryAsync();

        // ID do usuário recém-criado
        await using var idCmd = new NpgsqlCommand("SELECT id FROM usuarios WHERE email = @email", conn);
        idCmd.Parameters.AddWithValue("@email", email);
        var userId = (int)(await idCmd.ExecuteScalarAsync())!;

        // Registro do consentimento (data/hora, versão, status, usuário)
        await using var cons = new NpgsqlCommand("""
            INSERT INTO consentimentos (usuario_id, versao_termos, status)
            VALUES (@uid, @versao, 'ativo')
            """, conn);
        cons.Parameters.AddWithValue("@uid", userId);
        cons.Parameters.AddWithValue("@versao", versao);
        await cons.ExecuteNonQueryAsync();

        // Link de verificação (em produção deve ser enviado por e-mail)
        var link = $"{ctx.Request.Scheme}://{ctx.Request.Host}/api/auth/verificar?token={Uri.EscapeDataString(token)}";
        EnviarEmailVerificacao(email, link);

        return Results.Ok(new
        {
            mensagem      = "Conta criada. Verifique seu e-mail para ativá-la.",
            verificacaoUrl = link   // modo demo: em produção NÃO exponha o token na resposta
        });
    }
    catch (Exception ex)
    {
        return Results.Problem("Não foi possível criar a conta: " + ex.Message);
    }
});

// ── GET /api/auth/verificar?token=... ────────────────────
// Confirma o e-mail, ativa a conta e integra o usuário ao Explorar.
app.MapGet("/api/auth/verificar", async (string token) =>
{
    var (sucesso, mensagem) = await ConfirmarEmail(token);
    return Results.Content(HtmlConfirmacao(sucesso, mensagem), "text/html; charset=utf-8");
});

// ── POST /api/auth/login ───────────────────────────────────
// Só permite login se a conta estiver ativa (e-mail verificado).
app.MapPost("/api/auth/login", async (LoginDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
        return Results.BadRequest(new { erro = "Informe e-mail e senha." });

    var email = dto.Email.Trim().ToLowerInvariant();

    try
    {
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT id, senha_hash, ativo, email_verificado FROM usuarios WHERE email = @email", conn);
        cmd.Parameters.AddWithValue("@email", email);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return Results.Unauthorized();

        var userId = reader.GetInt32(0);
        var hash   = reader.GetString(1);
        var ativo  = reader.GetBoolean(2);
        var verif  = reader.GetBoolean(3);

        if (!ativo || !verif)
            return Results.Json(new { erro = "Conta aguardando verificação de e-mail." }, statusCode: 403);

        if (!VerifyPassword(dto.Password, hash))
            return Results.Unauthorized();

        return Results.Ok(new { token = IssueToken(userId), email = dto.Email });
    }
    catch
    {
        return Results.Unauthorized();
    }
});

// ── GET /api/cadastro ─────────────────────────────────────
// Usado por registros.html e explorar.html (lista pessoas).
app.MapGet("/api/cadastro", async () =>
{
    try
    {
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();

        const string sql = """
            SELECT id, nome, data_nasc, nacionalidade, descendencia,
                   ano_morte, informacoes_add, sequencia_dna
            FROM cadastro
            ORDER BY id
            """;

        await using var cmd    = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<object>();
        while (await reader.ReadAsync())
        {
            list.Add(new
            {
                id              = reader.IsDBNull(0) ? 0    : reader.GetInt32(0),
                nome            = reader.IsDBNull(1) ? null : reader.GetString(1),
                data_nasc       = reader.IsDBNull(2) ? null : reader.GetString(2),
                nacionalidade   = reader.IsDBNull(3) ? null : reader.GetString(3),
                descendencia    = reader.IsDBNull(4) ? null : reader.GetString(4),
                ano_morte       = reader.IsDBNull(5) ? null : reader.GetString(5),
                informacoes_add = reader.IsDBNull(6) ? null : reader.GetString(6),
                sequencia_dna   = reader.IsDBNull(7) ? null : reader.GetString(7),
            });
        }
        return Results.Ok(list);
    }
    catch
    {
        return Results.Ok(Array.Empty<object>());
    }
});

// ── POST /api/cadastro (exige token de sessão válido) ─────
app.MapPost("/api/cadastro", async (CadastroDto dto, HttpContext ctx) =>
{
    var auth = ctx.Request.Headers["Authorization"].ToString();
    if (!auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        return Results.Unauthorized();

    var token = auth["Bearer ".Length..].Trim();
    if (!TryValidateToken(token, out _))
        return Results.Unauthorized();

    await using var conn = new NpgsqlConnection(connStr);
    await conn.OpenAsync();

    const string sql = """
        INSERT INTO cadastro
            (nome, data_nasc, nacionalidade, descendencia,
             ano_morte, informacoes_add, sequencia_dna)
        VALUES
            (@nome, @data_nasc, @nacionalidade, @descendencia,
             @ano_morte, @informacoes_add, @sequencia_dna)
        """;

    await using var cmd = new NpgsqlCommand(sql, conn);

    cmd.Parameters.AddWithValue("@nome",           dto.Nome);
    cmd.Parameters.AddWithValue("@data_nasc",      dto.DataNasc);
    cmd.Parameters.AddWithValue("@nacionalidade",  dto.Nacionalidade);
    cmd.Parameters.AddWithValue("@descendencia",    (object?)dto.Descendencia   ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@ano_morte",       (object?)dto.AnoMorte       ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@informacoes_add", (object?)dto.InformacoesAdd ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@sequencia_dna",   (object?)dto.SequenciaDna   ?? DBNull.Value);

    await cmd.ExecuteNonQueryAsync();

    return Results.Ok("Cadastro realizado com sucesso.");
});

app.Run();

// ══════════════════════════════════════════════════════════
//  Helpers (lógica de serviço, no padrão de funções locais)
// ══════════════════════════════════════════════════════════

// ── Senha ──
string HashPassword(string password)
{
    var salt = RandomNumberGenerator.GetBytes(16);
    using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
    var hash = pbkdf2.GetBytes(32);
    return Convert.ToBase64String(salt) + ":" + Convert.ToBase64String(hash);
}

bool VerifyPassword(string password, string stored)
{
    var parts = stored.Split(':');
    if (parts.Length != 2) return false;
    var salt = Convert.FromBase64String(parts[0]);
    var expected = Convert.FromBase64String(parts[1]);
    using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
    var hash = pbkdf2.GetBytes(32);
    return CryptographicOperations.FixedTimeEquals(expected, hash);
}

// ── Token de sessão (HMAC) ──
string IssueToken(int userId)
{
    var exp = DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds();
    var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(userId + "." + exp));
    return payload + "." + Sign(payload);
}

bool TryValidateToken(string token, out int userId)
{
    userId = 0;
    var parts = token.Split('.');
    if (parts.Length != 2) return false;
    var expected = Sign(parts[0]);
    if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected),
                                                 Encoding.UTF8.GetBytes(parts[1])))
        return false;
    try
    {
        var raw = Encoding.UTF8.GetString(Convert.FromBase64String(parts[0]));
        var segs = raw.Split('.');
        if (segs.Length != 2) return false;
        if (!int.TryParse(segs[0], out var uid)) return false;
        if (!long.TryParse(segs[1], out var exp)) return false;
        if (exp < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return false;
        userId = uid;
        return true;
    }
    catch { return false; }
}

string Sign(string data)
{
    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(TokenSecret));
    return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(data)));
}

// ── Token de verificação (URL-safe, aleatório) ──
string GerarTokenVerificacao()
{
    var bytes = RandomNumberGenerator.GetBytes(32);
    return Convert.ToBase64String(bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=');
}

// ── E-mail (stub) ──
void EnviarEmailVerificacao(string email, string link)
{
    // STUB: integre um provedor SMTP (System.Net.Mail) ou serviço de e-mail.
    // Em produção, NÃO retorne o link na resposta — envie por e-mail.
    Console.WriteLine($"[AURORA] Verificação para {email}: {link}");
}

// ── Validação de e-mail ──
bool ValidarEmail(string email)
{
    var i = email.IndexOf('@');
    var j = email.LastIndexOf('.');
    return i > 0 && j > i + 1 && j < email.Length - 1 && !email.Contains(' ') && email.Length <= 254;
}

// ── Confirmação de e-mail + ativação + integração Explorar ──
async Task<(bool, string)> ConfirmarEmail(string token)
{
    if (string.IsNullOrWhiteSpace(token))
        return (false, "Token de verificação ausente.");

    try
    {
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();

        await using var sel = new NpgsqlCommand(
            "SELECT id, nome, ativo FROM usuarios WHERE token_verificacao = @token", conn);
        sel.Parameters.AddWithValue("@token", token);

        await using var reader = await sel.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            reader.Dispose();
            return (false, "Token inválido ou já utilizado.");
        }
        var userId  = reader.GetInt32(0);
        var nome    = reader.GetString(1);
        var jaAtivo = reader.GetBoolean(2);
        reader.Dispose();

        if (jaAtivo)
            return (true, "Sua conta já está verificada. Você pode fazer login.");

        // Ativa a conta e invalida o token (impede reutilização)
        await using var upd = new NpgsqlCommand("""
            UPDATE usuarios
            SET email_verificado = true,
                ativo = true,
                verificado_em = now(),
                token_verificacao = NULL,
                token_verificacao_expira_em = NULL
            WHERE id = @id
              AND token_verificacao_expira_em > now()
            """, conn);
        upd.Parameters.AddWithValue("@id", userId);
        if (await upd.ExecuteNonQueryAsync() == 0)
            return (false, "Token expirado. Solicite um novo envio de verificação.");

        // Integração com Explorar: cria o nó de pessoa vinculado à conta
        await using var chk = new NpgsqlCommand(
            "SELECT 1 FROM cadastro WHERE usuario_id = @uid", conn);
        chk.Parameters.AddWithValue("@uid", userId);
        if (await chk.ExecuteScalarAsync() == null)
        {
            await using var ins = new NpgsqlCommand(
                "INSERT INTO cadastro (nome, usuario_id) VALUES (@nome, @uid)", conn);
            ins.Parameters.AddWithValue("@nome", nome);
            ins.Parameters.AddWithValue("@uid", userId);
            await ins.ExecuteNonQueryAsync();
        }

        return (true, "Conta ativada com sucesso! Você agora está integrado ao Aurora.");
    }
    catch (Exception ex)
    {
        return (false, "Erro ao confirmar e-mail: " + ex.Message);
    }
}

// ── Página HTML de confirmação ──
string HtmlConfirmacao(bool ok, string msg)
{
    var cor = ok ? "var(--aurora-green)" : "var(--error)";
    var titulo = ok ? "✓" : "✕";
    return $@"<!DOCTYPE html>
<html lang='pt-BR'>
<head><meta charset='utf-8'><title>Aurora — Verificação</title>
<style>
  body {{ font-family: system-ui, sans-serif; background:#04121f; color:#e8f4f8;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }}
  .card {{ background:#0b2236; padding:40px 48px; border-radius:12px; text-align:center;
           max-width:460px; box-shadow:0 20px 60px rgba(0,0,0,.4); }}
  h1 {{ font-weight:300; font-size:3rem; margin:0 0 8px; }}
  p {{ color:#9fb6c4; line-height:1.5; }}
  a {{ color:{cor}; text-decoration:none; }}
  .msg {{ font-size:1.05rem; color:#e8f4f8; }}
</style>
</head>
<body>
  <div class='card'>
    <h1 style='color:{cor}'>{titulo}</h1>
    <p class='msg'>{msg}</p>
    <p><a href='/home.html'>Ir para o início</a></p>
  </div>
</body>
</html>";
}

// ── DTOs ─────────────────────────────────────────────────
record LoginDto(string Email, string Password);

record RegistroDto(
    string  Email,
    string  Senha,
    string? Nome,
    bool    AceiteTermos,
    string? VersaoTermos
);

record CadastroDto(
    string  Nome,
    string  DataNasc,
    string  Nacionalidade,
    string? Descendencia,
    string? AnoMorte,
    string? InformacoesAdd,
    string? SequenciaDna
);
