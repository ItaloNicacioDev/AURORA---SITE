// ══════════════════════════════════════════════════════════
//  Program.cs  —  Aurora Web API + Static Files
// ══════════════════════════════════════════════════════════
// Dependência: adicione ao projeto via NuGet:
//   dotnet add package Npgsql
// ══════════════════════════════════════════════════════════

using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var app     = builder.Build();

// ── Servir arquivos estáticos (css, js, imagens em wwwroot) ─
app.UseStaticFiles();

// String de conexão — ajuste conforme seu container
const string connStr =
    "Host=localhost;Port=5432;Database=aurora;Username=postgres;Password=SUA_SENHA";

// Páginas HTML (estão em wwwroot/html)
var pages = new[] { "home", "explorar", "registros", "sobre", "cadastro", "comprar" };

string PagePath(string name) =>
    Path.Combine(app.Environment.ContentRootPath, "wwwroot", "html", name + ".html");

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

// POST /api/auth/login — DEMO (trocar por Identity/JWT real).
// Retorna um token simples se as credenciais baterem.
app.MapPost("/api/auth/login", (LoginDto dto) =>
{
    const string demoEmail = "admin@aurora.app";
    const string demoPass  = "aurora123";
    if (dto.Email == demoEmail && dto.Password == demoPass)
        return Results.Ok(new { token = "aurora-" + Guid.NewGuid() });
    return Results.Unauthorized();
});

// GET /api/cadastro — lista registros (usado por registros.html e explorar.html).
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
        // Sem banco disponível: degrade graciosamente (lista vazia)
        return Results.Ok(Array.Empty<object>());
    }
});

// POST /api/cadastro (exige token de sessão Bearer).
app.MapPost("/api/cadastro", async (CadastroDto dto, HttpContext ctx) =>
{
    var auth = ctx.Request.Headers["Authorization"].ToString();
    if (string.IsNullOrWhiteSpace(auth) || !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
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

    // campos opcionais: null no C# → NULL no banco (sem bug)
    cmd.Parameters.AddWithValue("@descendencia",    (object?)dto.Descendencia   ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@ano_morte",       (object?)dto.AnoMorte       ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@informacoes_add", (object?)dto.InformacoesAdd ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@sequencia_dna",   (object?)dto.SequenciaDna   ?? DBNull.Value);

    await cmd.ExecuteNonQueryAsync();

    return Results.Ok("Cadastro realizado com sucesso.");
});

app.Run();

// ── DTOs ─────────────────────────────────────────────────
record LoginDto(string Email, string Password);

record CadastroDto(
    string  Nome,
    string  DataNasc,
    string  Nacionalidade,
    string? Descendencia,
    string? AnoMorte,
    string? InformacoesAdd,
    string? SequenciaDna
);
