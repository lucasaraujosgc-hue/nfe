using System.IO.Compression;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting; // Ensure this is available

var builder = WebApplication.CreateBuilder(args);

// --- FORÇAR PORTA 5000 (CRUCIAL PARA O PROXY DO VITE) ---
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    // Escuta em todos os IPs (0.0.0.0) na porta 5000
    serverOptions.ListenAnyIP(5000);
});

// Configuração de CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseCors("AllowAll");

Console.WriteLine("------------------------------------------------");
Console.WriteLine("   NFe Manager Pro - Backend Iniciado");
Console.WriteLine("   URL: http://localhost:5000");
Console.WriteLine("------------------------------------------------");

// --- CONFIGURAÇÃO DE DIRETÓRIOS ---
string BaseDataPath;
string BaseCertPath;
bool isDocker = Directory.Exists("/app");

if (isDocker)
{
    BaseDataPath = "/app/data";
    BaseCertPath = "/app/certificates";
}
else
{
    // Como mudamos o script para rodar dentro da pasta backend, o diretório atual é o do projeto
    var currentDir = Directory.GetCurrentDirectory();
    // Salva em uma pasta acima ou na própria pasta para facilitar debug
    BaseDataPath = Path.Combine(currentDir, "local_storage", "data");
    BaseCertPath = Path.Combine(currentDir, "local_storage", "certificates");
    Console.WriteLine($"[INFO] Modo Local. Salvando dados em: {BaseDataPath}");
}

// Inicialização segura de diretórios
try {
    if (!Directory.Exists(BaseDataPath)) Directory.CreateDirectory(BaseDataPath);
    if (!Directory.Exists(BaseCertPath)) Directory.CreateDirectory(BaseCertPath);
} catch (Exception ex) {
    Console.WriteLine($"[AVISO] Falha ao criar diretórios: {ex.Message}");
}

// --- ENDPOINTS ---

app.MapPost("/api/upload-cert", async (HttpContext context) =>
{
    try 
    {
        Console.WriteLine("-> Recebendo upload de certificado...");
        if (!context.Request.HasFormContentType)
            return Results.BadRequest("Content-Type inválido.");

        var form = await context.Request.ReadFormAsync();
        var file = form.Files["file"]; 

        if (file == null || file.Length == 0)
            return Results.BadRequest("Arquivo vazio.");

        var fileName = Path.GetFileName(file.FileName);
        var safeFileName = fileName.Replace(" ", "_");
        var filePath = Path.Combine(BaseCertPath, safeFileName);
        
        // Assegurar diretório antes de salvar
        if (!Directory.Exists(BaseCertPath)) Directory.CreateDirectory(BaseCertPath);
        if (File.Exists(filePath)) File.Delete(filePath);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }
        
        Console.WriteLine($"-> Certificado salvo: {safeFileName}");
        return Results.Ok(new { message = "Upload realizado", filename = safeFileName, path = filePath });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ERRO UPLOAD] {ex.Message}");
        return Results.Problem($"Erro no servidor: {ex.Message}");
    }
}).DisableAntiforgery();

var dbPath = Path.Combine(BaseDataPath, "db.json");

app.MapGet("/api/db", async () =>
{
    if (!File.Exists(dbPath)) return Results.Json(new { companies = new List<object>(), invoices = new List<object>() });
    var content = await File.ReadAllTextAsync(dbPath);
    return Results.Content(content, "application/json");
});

app.MapPost("/api/db", async (HttpContext context) =>
{
    try {
        using var reader = new StreamReader(context.Request.Body);
        var body = await reader.ReadToEndAsync();
        
        if (!Directory.Exists(BaseDataPath)) Directory.CreateDirectory(BaseDataPath);
        
        // Validar e formatar JSON
        var parsed = JsonConvert.DeserializeObject(body);
        var indented = JsonConvert.SerializeObject(parsed, Formatting.Indented);

        await File.WriteAllTextAsync(dbPath, indented);
        return Results.Ok(new { success = true });
    } catch (Exception ex) {
        Console.WriteLine($"[ERRO DB] {ex.Message}");
        return Results.Problem(ex.Message);
    }
});

app.MapPost("/api/sefaz/dist-dfe", async (HttpContext context) =>
{
    Console.WriteLine($"-> Processando Consulta SEFAZ (DistDFe)");
    try
    {
        var requestBody = await new StreamReader(context.Request.Body).ReadToEndAsync();
        var json = JObject.Parse(requestBody);
        
        string xmlBody = json["xml"]?.ToString() ?? "";
        string password = json["password"]?.ToString() ?? "";
        string companyId = context.Request.Headers["X-Company-ID"].ToString();

        if (string.IsNullOrEmpty(companyId)) return Results.BadRequest("Header X-Company-ID ausente");

        if (!File.Exists(dbPath)) return Results.NotFound("Banco de dados vazio");
        var dbContent = await File.ReadAllTextAsync(dbPath);
        var dbJson = JObject.Parse(dbContent);
        
        var company = dbJson["companies"]?.FirstOrDefault(c => c["id"]?.ToString() == companyId);
        if (company == null) return Results.NotFound("Empresa não encontrada");

        string certName = company["certificateName"]?.ToString() ?? "";
        var certPath = Path.Combine(BaseCertPath, certName);
        
        // Fallback de nome (com/sem underscore)
        if (!File.Exists(certPath))
        {
            var altPath = Path.Combine(BaseCertPath, certName.Replace(" ", "_"));
            if (File.Exists(altPath)) certPath = altPath;
        }
        
        if (!File.Exists(certPath))
        {
            Console.WriteLine($"[ERRO] Certificado não encontrado: {certPath}");
            return Results.BadRequest($"Certificado não encontrado no disco.");
        }

        X509Certificate2 certificate;
        try 
        {
             certificate = new X509Certificate2(certPath, password, X509KeyStorageFlags.EphemeralKeySet);
        } 
        catch 
        {
             try 
             {
                 certificate = new X509Certificate2(certPath, password, 
                    X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.PersistKeySet | X509KeyStorageFlags.Exportable);
             } 
             catch (System.Security.Cryptography.CryptographicException ce) 
             {
                 Console.WriteLine($"[ERRO CRYPTO] {ce.Message}");
                 return Results.BadRequest($"Senha do certificado incorreta ou arquivo inválido.");
             }
        }

        var soapEnvelope = $@"<soap12:Envelope xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"" xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:soap12=""http://www.w3.org/2003/05/soap-envelope"">
            <soap12:Body>
                <nfeDistDFeInteresse xmlns=""http://www.portalfiscal.inf.br/nfe"">
                    <nfeDadosMsg>{xmlBody}</nfeDadosMsg>
                </nfeDistDFeInteresse>
            </soap12:Body>
        </soap12:Envelope>";

        var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(certificate);
        handler.ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true; 

        using var client = new HttpClient(handler);
        client.Timeout = TimeSpan.FromSeconds(30);
        
        var url = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
        var content = new StringContent(soapEnvelope, Encoding.UTF8, "application/soap+xml");

        var response = await client.PostAsync(url, content);
        var responseXmlStr = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"[SEFAZ HTTP ERRO] {response.StatusCode}");
            return Results.StatusCode((int)response.StatusCode);
        }

        var doc = XDocument.Parse(responseXmlStr);
        XNamespace nsSoap = "http://www.w3.org/2003/05/soap-envelope";
        XNamespace nsNfe = "http://www.portalfiscal.inf.br/nfe";

        var body = doc.Descendants(nsSoap + "Body").FirstOrDefault();
        var retDistDFeInt = body?.Descendants(nsNfe + "retDistDFeInt").FirstOrDefault();

        if (retDistDFeInt == null) return Results.Problem("XML de resposta da SEFAZ inválido.");

        var cStat = retDistDFeInt.Element(nsNfe + "cStat")?.Value;
        var xMotivo = retDistDFeInt.Element(nsNfe + "xMotivo")?.Value;
        var maxNSU = retDistDFeInt.Element(nsNfe + "maxNSU")?.Value;
        
        Console.WriteLine($"[SEFAZ] Status: {cStat} - {xMotivo}");

        var processedInvoices = new List<object>();

        if (cStat == "138") 
        {
            var lote = retDistDFeInt.Element(nsNfe + "loteDistDFeInt");
            if (lote != null)
            {
                foreach (var docZip in lote.Elements(nsNfe + "docZip"))
                {
                    try {
                        var nsu = docZip.Attribute("NSU")?.Value;
                        var schema = docZip.Attribute("schema")?.Value;
                        var base64Content = docZip.Value;
                        var xmlContent = DecompressGZip(base64Content);
                        var docXml = XDocument.Parse(xmlContent);

                        if (schema == "resNFe_v1.01.xsd")
                        {
                            var resNFe = docXml.Root;
                            processedInvoices.Add(new {
                                accessKey = resNFe?.Element(nsNfe + "chNFe")?.Value,
                                emitenteCNPJ = resNFe?.Element(nsNfe + "CNPJ")?.Value ?? resNFe?.Element(nsNfe + "CPF")?.Value,
                                emitenteName = resNFe?.Element(nsNfe + "xNome")?.Value,
                                emissionDate = resNFe?.Element(nsNfe + "dhEmi")?.Value,
                                amount = double.Parse(resNFe?.Element(nsNfe + "vNF")?.Value?.Replace(".", ",") ?? "0"),
                                status = resNFe?.Element(nsNfe + "cSitNFe")?.Value == "1" ? "authorized" : "canceled",
                                nsu = nsu,
                                numero = "000",
                                serie = "0",
                                companyId = companyId,
                                id = $"inv-{Guid.NewGuid()}",
                                downloaded = false
                            });
                        }
                        else if (schema == "procNFe_v4.00.xsd")
                        {
                            var nfe = docXml.Descendants(nsNfe + "NFe").FirstOrDefault();
                            var infNFe = nfe?.Element(nsNfe + "infNFe");
                            var ide = infNFe?.Element(nsNfe + "ide");
                            var emit = infNFe?.Element(nsNfe + "emit");
                            var total = infNFe?.Element(nsNfe + "total")?.Element(nsNfe + "ICMSTot");
                            var prot = docXml.Descendants(nsNfe + "protNFe").FirstOrDefault()?.Element(nsNfe + "infProt");

                            processedInvoices.Add(new
                            {
                                accessKey = prot?.Element(nsNfe + "chNFe")?.Value,
                                emitenteCNPJ = emit?.Element(nsNfe + "CNPJ")?.Value,
                                emitenteName = emit?.Element(nsNfe + "xNome")?.Value,
                                emissionDate = ide?.Element(nsNfe + "dhEmi")?.Value,
                                authorizationDate = prot?.Element(nsNfe + "dhRecbto")?.Value,
                                amount = double.Parse(total?.Element(nsNfe + "vNF")?.Value?.Replace(".", ",") ?? "0"),
                                status = "authorized",
                                nsu = nsu,
                                numero = ide?.Element(nsNfe + "nNF")?.Value,
                                serie = ide?.Element(nsNfe + "serie")?.Value,
                                uf = emit?.Element(nsNfe + "enderEmit")?.Element(nsNfe + "UF")?.Value,
                                operationType = ide?.Element(nsNfe + "tpNF")?.Value == "0" ? "Entrada" : "Saida",
                                companyId = companyId,
                                id = $"inv-{Guid.NewGuid()}",
                                downloaded = true
                            });
                        }
                    } catch (Exception parseEx) {
                        Console.WriteLine($"[ERRO PARSE DOC] {parseEx.Message}");
                    }
                }
            }
        }

        return Results.Ok(new { cStat, xMotivo, maxNSU, invoices = processedInvoices });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ERRO GERAL] {ex.ToString()}");
        return Results.Problem($"Erro Interno: {ex.Message}");
    }
});

app.Run(); // Use padrão do launchSettings.json ou Kestrel configurado acima

string DecompressGZip(string base64)
{
    byte[] compressed = Convert.FromBase64String(base64);
    using var ms = new MemoryStream(compressed);
    using var gzip = new GZipStream(ms, CompressionMode.Decompress);
    using var reader = new StreamReader(gzip, Encoding.UTF8);
    return reader.ReadToEnd();
}