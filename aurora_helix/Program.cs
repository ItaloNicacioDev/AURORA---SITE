// ══════════════════════════════════════════════════════════
//  Program.cs  —  Aurora Web API + Static Files
// ═══════════════════γ═════════════════════════════════════
using Npgsql;
using System.Text;
using System.Security.Cryptography;

var builder = WebApplication.CreateBuilder(args);
var app     = builder.Build();

// ── Servir arquivos estáticos (css, js, imagens em wwwroot) ─
app.UseStaticFiles();

// String de conexão — ajuste a senha (SUA_SENHA) conforme seu container
const string connStr =
    "Host=localhost;Port=5432;Database=aurora;Username=postgres;Password=SUA_SENHA";

// Segredo usado para assinar os tokens de sessão (altere em produção)
const string TokenSecret = "aurora-helix-chave-super-secreta-altere-me";

// Páginas HTML (estão em wwwroot/html)
var pages = new[] { "home", "explorar", "registros", "sobre", "cadastro", "comprar" };

string PagePath(string name) =>
    Path.Combine(app.Environment.ContentRootPath, "wwwroot", "html", name + ".html");

// ── Cria as tabelas necessárias (best-effort) ao iniciar ──
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
app.MapPost("/api/auth/registro", async (RegistroDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Senha))
        return Results.BadRequest(new { erro = "Informe e-mail e senha." });

    var email = dto.Email.Trim().ToLowerInvariant();

    try
    {
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();

        await using (var check = new NpgsqlCommand(
            "SELECT 1 FROM usuarios WHERE email = @email", conn))
        {
            check.Parameters.AddWithValue("@email", email);
            if (await check.ExecuteScalarAsync() != null)
                return Results.Conflict(new { erro = "Este e-mail já está cadastrado." });
        }

        await using var cmd = new NpgsqlCommand(
            "INSERT INTO usuarios (email, senha_hash, nome) VALUES (@email, @senha_hash, @nome)",
            conn);
        cmd.Parameters.AddWithValue("@email", email);
        cmd.Parameters.AddWithValue("@senha_hash", HashPassword(dto.Senha));
        cmd.Parameters.AddWithValue("@nome", (object?)dto.Nome?.Trim() ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();

        return Results.Ok(new { mensagem = "Conta criada com sucesso." });
    }
    catch (Exception ex)
    {
        return Results.Problem("Não foi possível criar a conta: " + ex.Message);
    }
});

// ── POST /api/auth/login ───────────────────────────────────
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
            "SELECT id, senha_hash FROM usuarios WHERE email = @email", conn);
        cmd.Parameters.AddWithValue("@email", email);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return Results.Unauthorized();

        var userId = reader.GetInt32(0);
        var hash   = reader.GetString(1);

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

// ── Helpers: senha e token ────────────────────────────────
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

// ── DTOs ─────────────────────────────────────────────────
record LoginDto(string Email, string Password);

record RegistroDto(
    string  Email,
    string  Senha,
    string? Nome
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
