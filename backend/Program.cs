using System.IO.Compression;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting; 

var builder = WebApplication.CreateBuilder(args);

// --- FORÇAR PORTA 5000 ---
builder.WebHost.ConfigureKestrel(serverOptions =>
{
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
    var currentDir = Directory.GetCurrentDirectory();
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

        // --- CORREÇÃO SOAP 1.2 ---
        // Ajuste dos Namespaces e Action conforme WSDL oficial do NFeDistribuicaoDFe
        var wsdlNamespace = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
        
        // Envelope SOAP 1.2
        var soapEnvelope = $@"<soap12:Envelope xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"" xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:soap12=""http://www.w3.org/2003/05/soap-envelope"">
            <soap12:Body>
                <nfeDistDFeInteresse xmlns=""{wsdlNamespace}"">
                    <nfeDadosMsg>
                        {xmlBody}
                    </nfeDadosMsg>
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
        
        // A Action deve incluir o caminho completo definido no WSDL
        var actionUri = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";
        content.Headers.ContentType.Parameters.Add(new System.Net.Http.Headers.NameValueHeaderValue("action", $"\"{actionUri}\""));

        Console.WriteLine($"-> Enviando requisição SOAP 1.2 para {url}...");

        var response = await client.PostAsync(url, content);
        var responseXmlStr = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"[SEFAZ HTTP ERRO {response.StatusCode}]: {responseXmlStr}");
            return Results.Problem(detail: $"SEFAZ retornou {response.StatusCode}. Detalhes: {responseXmlStr}", statusCode: (int)response.StatusCode);
        }

        Console.WriteLine("-> Resposta SEFAZ recebida. Processando...");

        var doc = XDocument.Parse(responseXmlStr);
        
        // Namespaces de Resposta do SOAP 1.2
        XNamespace nsSoap = "http://www.w3.org/2003/05/soap-envelope";
        XNamespace nsNfe = "http://www.portalfiscal.inf.br/nfe";

        var body = doc.Descendants(nsSoap + "Body").FirstOrDefault();
        var retDistDFeInt = body?.Descendants(nsNfe + "retDistDFeInt").FirstOrDefault();

        if (retDistDFeInt == null) 
        {
            // Tenta encontrar sem namespace caso a SEFAZ responda de forma atípica
            retDistDFeInt = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "retDistDFeInt");
        }

        if (retDistDFeInt == null) 
        {
            Console.WriteLine($"[ERRO XML] Resposta inesperada: {responseXmlStr}");
            return Results.Problem($"XML de resposta da SEFAZ inválido ou inesperado. Veja logs.");
        }

        var cStat = retDistDFeInt.Element(nsNfe + "cStat")?.Value ?? retDistDFeInt.Element("cStat")?.Value;
        var xMotivo = retDistDFeInt.Element(nsNfe + "xMotivo")?.Value ?? retDistDFeInt.Element("xMotivo")?.Value;
        var maxNSU = retDistDFeInt.Element(nsNfe + "maxNSU")?.Value ?? retDistDFeInt.Element("maxNSU")?.Value;
        
        Console.WriteLine($"[SEFAZ] Status: {cStat} - {xMotivo}");

        var processedInvoices = new List<object>();

        if (cStat == "138") 
        {
            var lote = retDistDFeInt.Element(nsNfe + "loteDistDFeInt") ?? retDistDFeInt.Element("loteDistDFeInt");
            if (lote != null)
            {
                var docZips = lote.Elements(nsNfe + "docZip").Any() ? lote.Elements(nsNfe + "docZip") : lote.Elements("docZip");
                
                foreach (var docZip in docZips)
                {
                    try {
                        var nsu = docZip.Attribute("NSU")?.Value;
                        var schema = docZip.Attribute("schema")?.Value;
                        var base64Content = docZip.Value;
                        var xmlContent = DecompressGZip(base64Content);
                        var docXml = XDocument.Parse(xmlContent);

                        if (schema != null && schema.Contains("resNFe"))
                        {
                            var resNFe = docXml.Root;
                            var nsRes = resNFe.GetDefaultNamespace();
                            processedInvoices.Add(new {
                                accessKey = resNFe.Element(nsRes + "chNFe")?.Value,
                                emitenteCNPJ = resNFe.Element(nsRes + "CNPJ")?.Value ?? resNFe.Element(nsRes + "CPF")?.Value,
                                emitenteName = resNFe.Element(nsRes + "xNome")?.Value,
                                emissionDate = resNFe.Element(nsRes + "dhEmi")?.Value,
                                amount = double.Parse(resNFe.Element(nsRes + "vNF")?.Value?.Replace(".", ",") ?? "0"),
                                status = resNFe.Element(nsRes + "cSitNFe")?.Value == "1" ? "authorized" : "canceled",
                                nsu = nsu,
                                numero = "000",
                                serie = "0",
                                companyId = companyId,
                                id = $"inv-{Guid.NewGuid()}",
                                downloaded = false
                            });
                        }
                        else if (schema != null && schema.Contains("procNFe"))
                        {
                            var nfeRoot = docXml.Root; 
                            var nsProc = nfeRoot.GetDefaultNamespace();
                            
                            var nfe = docXml.Descendants(nsProc + "NFe").FirstOrDefault();
                            var nsNFeLocal = nfe?.GetDefaultNamespace() ?? nsProc;
                            
                            var infNFe = nfe?.Element(nsNFeLocal + "infNFe");
                            var ide = infNFe?.Element(nsNFeLocal + "ide");
                            var emit = infNFe?.Element(nsNFeLocal + "emit");
                            var total = infNFe?.Element(nsNFeLocal + "total")?.Element(nsNFeLocal + "ICMSTot");
                            var prot = docXml.Descendants(nsProc + "protNFe").FirstOrDefault()?.Element(nsProc + "infProt");

                            processedInvoices.Add(new
                            {
                                accessKey = prot?.Element(nsProc + "chNFe")?.Value,
                                emitenteCNPJ = emit?.Element(nsNFeLocal + "CNPJ")?.Value,
                                emitenteName = emit?.Element(nsNFeLocal + "xNome")?.Value,
                                emissionDate = ide?.Element(nsNFeLocal + "dhEmi")?.Value,
                                authorizationDate = prot?.Element(nsProc + "dhRecbto")?.Value,
                                amount = double.Parse(total?.Element(nsNFeLocal + "vNF")?.Value?.Replace(".", ",") ?? "0"),
                                status = "authorized",
                                nsu = nsu,
                                numero = ide?.Element(nsNFeLocal + "nNF")?.Value,
                                serie = ide?.Element(nsNFeLocal + "serie")?.Value,
                                uf = emit?.Element(nsNFeLocal + "enderEmit")?.Element(nsNFeLocal + "UF")?.Value,
                                operationType = ide?.Element(nsNFeLocal + "tpNF")?.Value == "0" ? "Entrada" : "Saida",
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

app.Run();

string DecompressGZip(string base64)
{
    byte[] compressed = Convert.FromBase64String(base64);
    using var ms = new MemoryStream(compressed);
    using var gzip = new GZipStream(ms, CompressionMode.Decompress);
    using var reader = new StreamReader(gzip, Encoding.UTF8);
    return reader.ReadToEnd();
}