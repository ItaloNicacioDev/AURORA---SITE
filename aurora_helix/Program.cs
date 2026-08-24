// ══════════════════════════════════════════════════════════
//  Program.cs  —  Aurora Web API + Static Files
// ══════════════════════════════════════════════════════════
// Dependência: adicione ao projeto via NuGet:
//   dotnet add package Npgsql
// ══════════════════════════════════════════════════════════

using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var app     = builder.Build();

// ── Servir arquivos estáticos (wwwroot) ──────────────────
app.UseStaticFiles();

// ── Rota home ────────────────────────────────────────────
app.MapGet("/", async (HttpContext ctx) =>
{
    var file = Path.Combine("wwwroot", "home.html");
    ctx.Response.ContentType = "text/html";
    await ctx.Response.SendFileAsync(file);
});

// ── POST /api/auth/login ─────────────────────────────────
// DEMO: substituir por identidade real (ASP.NET Identity / JWT).
// Retorna um token simples se as credenciais baterem.
app.MapPost("/api/auth/login", (LoginDto dto) =>
{
    const string demoEmail = "admin@aurora.app";
    const string demoPass  = "aurora123";
    if (dto.Email == demoEmail && dto.Password == demoPass)
        return Results.Ok(new { token = "aurora-" + Guid.NewGuid() });
    return Results.Unauthorized();
});

// ── POST /api/cadastro (exige sessão) ───────────────────
app.MapPost("/api/cadastro", async (CadastroDto dto, HttpContext ctx) =>
{
    // proteção mínima: exige um token de sessão válido
    var auth = ctx.Request.Headers["Authorization"].ToString();
    if (string.IsNullOrWhiteSpace(auth) || !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        return Results.Unauthorized();

    // String de conexão — ajuste conforme seu container
    const string connStr =
        "Host=localhost;Port=5432;Database=aurora;Username=postgres;Password=SUA_SENHA";

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
