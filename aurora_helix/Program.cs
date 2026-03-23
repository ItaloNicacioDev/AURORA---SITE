var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseStaticFiles();

app.MapGet("/", async (HttpContext ctx) =>
{
    var file = Path.Combine("wwwroot", "home.html");
    ctx.Response.ContentType = "text/html";
    await ctx.Response.SendFileAsync(file);
});

app.Run();