using System.IO.Compression;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Microsoft.AspNetCore.Http; // Necessário para IFormFile

var builder = WebApplication.CreateBuilder(args);

// Configuração de CORS para permitir desenvolvimento local
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseCors("AllowAll");

Console.WriteLine("=== NFe Manager Pro Backend Started ===");
Console.WriteLine($"Environment: {app.Environment.EnvironmentName}");
Console.WriteLine($"Listening on: http://0.0.0.0:5000");

// --- CONFIGURAÇÃO DE DIRETÓRIOS (VOLUMES DOCKER) ---
string BaseDataPath = "/app/data";
string BaseCertPath = "/app/certificates";

// Garantir que diretórios existam
try {
    if (!Directory.Exists(BaseDataPath)) Directory.CreateDirectory(BaseDataPath);
    if (!Directory.Exists(BaseCertPath)) Directory.CreateDirectory(BaseCertPath);
} catch (Exception ex) {
    Console.WriteLine($"FATAL: Failed to create directories: {ex.Message}");
}

Console.WriteLine($"Database Path: {BaseDataPath}");
Console.WriteLine($"Certificates Path: {BaseCertPath}");

// --- ENDPOINTS ---

// 1. Endpoint de Upload de Certificado (Refatorado para robustez)
app.MapPost("/api/upload-cert", async (HttpContext context) =>
{
    try 
    {
        if (!context.Request.HasFormContentType)
            return Results.BadRequest("Content-Type inválido. Esperado multipart/form-data.");

        var form = await context.Request.ReadFormAsync();
        var file = form.Files["file"]; // O nome do campo no Frontend deve ser 'file'

        if (file == null || file.Length == 0)
            return Results.BadRequest("Nenhum arquivo encontrado no campo 'file'.");

        // Sanitizar nome do arquivo (segurança e compatibilidade)
        var fileName = Path.GetFileName(file.FileName);
        var safeFileName = fileName.Replace(" ", "_");
        var filePath = Path.Combine(BaseCertPath, safeFileName);
        
        Console.WriteLine($"Recebendo arquivo: {fileName} -> {filePath}");

        // Deletar se já existir para substituir
        if (File.Exists(filePath)) File.Delete(filePath);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }
        
        Console.WriteLine("Upload concluído com sucesso.");
        // Retorna o nome do arquivo salvo para o frontend atualizar o estado se necessário
        return Results.Ok(new { message = "Upload realizado", filename = safeFileName, path = filePath });
    }
    catch (UnauthorizedAccessException uex)
    {
        Console.WriteLine($"ERRO PERMISSÃO: {uex.Message}");
        return Results.Problem($"Permissão negada ao salvar em {BaseCertPath}. Verifique os volumes do Docker.");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"ERRO UPLOAD: {ex.ToString()}");
        return Results.Problem($"Erro interno ao salvar arquivo: {ex.Message}");
    }
}).DisableAntiforgery();

// 2. Endpoint de Banco de Dados (Leitura/Escrita em Arquivo JSON)
var dbPath = Path.Combine(BaseDataPath, "db.json");

app.MapGet("/api/db", async () =>
{
    if (!File.Exists(dbPath)) return Results.Json(new { companies = new List<object>(), invoices = new List<object>() });
    var content = await File.ReadAllTextAsync(dbPath);
    return Results.Content(content, "application/json");
});

app.MapPost("/api/db", async (HttpContext context) =>
{
    using var reader = new StreamReader(context.Request.Body);
    var body = await reader.ReadToEndAsync();
    await File.WriteAllTextAsync(dbPath, body);
    return Results.Ok(new { success = true });
});

// 3. Endpoint de Consulta SEFAZ (DistDFe)
app.MapPost("/api/sefaz/dist-dfe", async (HttpContext context) =>
{
    Console.WriteLine($"[{DateTime.Now}] Received request for /api/sefaz/dist-dfe");
    try
    {
        // Ler payload do Frontend
        var requestBody = await new StreamReader(context.Request.Body).ReadToEndAsync();
        var json = JObject.Parse(requestBody);
        
        string xmlBody = json["xml"]?.ToString() ?? "";
        string password = json["password"]?.ToString() ?? "";
        string companyId = context.Request.Headers["X-Company-ID"].ToString();

        if (string.IsNullOrEmpty(companyId)) return Results.BadRequest("X-Company-ID header missing");

        // Buscar nome do certificado no DB
        if (!File.Exists(dbPath)) return Results.NotFound("Database not found");
        var dbContent = await File.ReadAllTextAsync(dbPath);
        var dbJson = JObject.Parse(dbContent);
        
        var company = dbJson["companies"]?.FirstOrDefault(c => c["id"]?.ToString() == companyId);
        if (company == null) return Results.NotFound("Company not found in DB");

        string certName = company["certificateName"]?.ToString() ?? "";
        
        // Caminho do Certificado (Usa caminho absoluto configurado)
        var certPath = Path.Combine(BaseCertPath, certName);
        
        // Se o nome no banco tiver espaços e salvamos com _, tentamos o fallback
        if (!File.Exists(certPath))
        {
            var altPath = Path.Combine(BaseCertPath, certName.Replace(" ", "_"));
            if (File.Exists(altPath)) certPath = altPath;
        }
        
        if (!File.Exists(certPath))
        {
            Console.WriteLine($"Error: Certificate not found at {certPath}");
            return Results.BadRequest($"Certificado não encontrado no servidor em: {certPath}. Faça o upload novamente.");
        }

        Console.WriteLine($"Loading Certificate: {certPath}");

        // --- LÓGICA DE CONEXÃO COM A SEFAZ ---

        // 1. Carregar Certificado
        X509Certificate2 certificate;
        try {
             // Flags para compatibilidade Linux/Docker
             certificate = new X509Certificate2(certPath, password, 
                X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.PersistKeySet | X509KeyStorageFlags.Exportable);
        } catch (System.Security.Cryptography.CryptographicException ce) {
             Console.WriteLine($"Crypto Error: {ce.Message}");
             return Results.BadRequest($"Falha ao abrir certificado (Senha incorreta?): {ce.Message}");
        }

        // 2. Montar Envelope SOAP
        var soapEnvelope = $@"<soap12:Envelope xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"" xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:soap12=""http://www.w3.org/2003/05/soap-envelope"">
            <soap12:Body>
                <nfeDistDFeInteresse xmlns=""http://www.portalfiscal.inf.br/nfe"">
                    <nfeDadosMsg>{xmlBody}</nfeDadosMsg>
                </nfeDistDFeInteresse>
            </soap12:Body>
        </soap12:Envelope>";

        // 3. Configurar Cliente HTTP com SSL Mútuo
        var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(certificate);
        handler.ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true; 

        using var client = new HttpClient(handler);
        client.Timeout = TimeSpan.FromSeconds(30);
        
        var url = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
        
        Console.WriteLine($"Sending SOAP Request to {url}...");
        
        var content = new StringContent(soapEnvelope, Encoding.UTF8, "application/soap+xml");

        // 4. Enviar Requisição
        var response = await client.PostAsync(url, content);
        var responseXmlStr = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"SEFAZ Error {response.StatusCode}: {responseXmlStr}");
            return Results.StatusCode((int)response.StatusCode);
        }

        Console.WriteLine("SEFAZ Response received. Parsing...");

        // 5. Processar Retorno XML
        var doc = XDocument.Parse(responseXmlStr);
        XNamespace nsSoap = "http://www.w3.org/2003/05/soap-envelope";
        XNamespace nsNfe = "http://www.portalfiscal.inf.br/nfe";

        var body = doc.Descendants(nsSoap + "Body").FirstOrDefault();
        var nfeDistResponse = body?.Descendants(nsNfe + "nfeDistDFeInteresseResponse").FirstOrDefault();
        var nfeResult = nfeDistResponse?.Descendants(nsNfe + "nfeDistDFeInteresseResult").FirstOrDefault();
        var retDistDFeInt = nfeResult?.Descendants(nsNfe + "retDistDFeInt").FirstOrDefault();

        if (retDistDFeInt == null) return Results.Problem("Invalid SEFAZ Response format");

        var cStat = retDistDFeInt.Element(nsNfe + "cStat")?.Value;
        var xMotivo = retDistDFeInt.Element(nsNfe + "xMotivo")?.Value;
        var maxNSU = retDistDFeInt.Element(nsNfe + "maxNSU")?.Value;
        
        Console.WriteLine($"SEFAZ Status: {cStat} - {xMotivo}");

        var processedInvoices = new List<object>();

        if (cStat == "138") // Documentos localizados
        {
            var lote = retDistDFeInt.Element(nsNfe + "loteDistDFeInt");
            if (lote != null)
            {
                foreach (var docZip in lote.Elements(nsNfe + "docZip"))
                {
                    var nsu = docZip.Attribute("NSU")?.Value;
                    var schema = docZip.Attribute("schema")?.Value;
                    var base64Content = docZip.Value;

                    // Descompactar GZIP
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
                }
            }
        }

        return Results.Ok(new
        {
            cStat,
            xMotivo,
            maxNSU,
            invoices = processedInvoices
        });

    }
    catch (Exception ex)
    {
        Console.WriteLine($"EXCEPTION: {ex.ToString()}");
        // Retorna JSON problem detail padrão
        return Results.Problem($"Erro Interno: {ex.Message}");
    }
});

app.Run("http://0.0.0.0:5000");

// --- HELPER FUNCTIONS ---

string DecompressGZip(string base64)
{
    byte[] compressed = Convert.FromBase64String(base64);
    using var ms = new MemoryStream(compressed);
    using var gzip = new GZipStream(ms, CompressionMode.Decompress);
    using var reader = new StreamReader(gzip, Encoding.UTF8);
    return reader.ReadToEnd();
}