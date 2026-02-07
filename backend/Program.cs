using System.IO.Compression;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using System.Globalization; 

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

try {
    if (!Directory.Exists(BaseDataPath)) Directory.CreateDirectory(BaseDataPath);
    if (!Directory.Exists(BaseCertPath)) Directory.CreateDirectory(BaseCertPath);
} catch (Exception ex) {
    Console.WriteLine($"[AVISO] Falha ao criar diretórios: {ex.Message}");
}

// --- HELPER: ASSINATURA DIGITAL (XML SIGNATURE) ---
string SignXml(string xmlString, X509Certificate2 cert, string docId)
{
    try 
    {
        var doc = new XmlDocument();
        doc.PreserveWhitespace = true;
        doc.LoadXml(xmlString);

        var signedXml = new SignedXml(doc);
        var key = cert.GetRSAPrivateKey();
        if (key == null) throw new Exception("O certificado não possui chave privada válida para assinatura.");
        signedXml.SigningKey = key;

        // Referência ao ID do elemento a ser assinado (infEvento)
        var reference = new Reference();
        reference.Uri = "#" + docId;
        
        // Transformações exigidas pela SEFAZ
        reference.AddTransform(new XmlDsigEnvelopedSignatureTransform());
        reference.AddTransform(new XmlDsigC14NTransform());
        
        signedXml.AddReference(reference);

        // KeyInfo
        var keyInfo = new KeyInfo();
        keyInfo.AddClause(new KeyInfoX509Data(cert));
        signedXml.KeyInfo = keyInfo;

        signedXml.ComputeSignature();

        var xmlDigitalSignature = signedXml.GetXml();
        
        // Adiciona a assinatura dentro da tag <evento>, após <infEvento>
        var eventoNode = doc.GetElementsByTagName("evento")[0];
        eventoNode.AppendChild(doc.ImportNode(xmlDigitalSignature, true));

        return doc.OuterXml;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ERRO ASSINATURA] {ex.Message}");
        throw;
    }
}

// --- HELPER DE PARSE ---
List<object> ParseDocZips(IEnumerable<XElement> docZips, string companyId)
{
    var processedInvoices = new List<object>();
    var culture = CultureInfo.InvariantCulture;

    foreach (var docZip in docZips)
    {
        try {
            var nsu = docZip.Attribute("NSU")?.Value ?? "0";
            var schema = docZip.Attribute("schema")?.Value;
            var base64Content = docZip.Value;
            var xmlContent = DecompressGZip(base64Content);
            var docXml = XDocument.Parse(xmlContent);

            if (schema != null && schema.Contains("resNFe"))
            {
                var resNFe = docXml.Root;
                if (resNFe != null) {
                    var nsRes = resNFe.GetDefaultNamespace();
                    
                    processedInvoices.Add(new {
                        accessKey = resNFe.Element(nsRes + "chNFe")?.Value,
                        emitenteCNPJ = resNFe.Element(nsRes + "CNPJ")?.Value ?? resNFe.Element(nsRes + "CPF")?.Value,
                        emitenteName = resNFe.Element(nsRes + "xNome")?.Value,
                        emissionDate = resNFe.Element(nsRes + "dhEmi")?.Value,
                        amount = double.Parse(resNFe.Element(nsRes + "vNF")?.Value ?? "0", culture),
                        status = resNFe.Element(nsRes + "cSitNFe")?.Value == "1" ? "authorized" : "canceled",
                        nsu = nsu,
                        numero = "000",
                        serie = "0",
                        companyId = companyId,
                        id = $"inv-{Guid.NewGuid()}", 
                        downloaded = false,
                        originalXml = xmlContent
                    });
                }
            }
            else if (schema != null && schema.Contains("procNFe"))
            {
                var nfeRoot = docXml.Root; 
                if (nfeRoot != null) {
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
                        amount = double.Parse(total?.Element(nsNFeLocal + "vNF")?.Value ?? "0", culture),
                        status = "authorized",
                        nsu = nsu,
                        numero = ide?.Element(nsNFeLocal + "nNF")?.Value,
                        serie = ide?.Element(nsNFeLocal + "serie")?.Value,
                        uf = emit?.Element(nsNFeLocal + "enderEmit")?.Element(nsNFeLocal + "UF")?.Value,
                        operationType = ide?.Element(nsNFeLocal + "tpNF")?.Value == "0" ? "Entrada" : "Saida",
                        companyId = companyId,
                        id = $"inv-{Guid.NewGuid()}",
                        downloaded = true,
                        originalXml = xmlContent
                    });
                }
            }
        } catch (Exception parseEx) {
            Console.WriteLine($"[ERRO PARSE DOC] {parseEx.Message}");
        }
    }
    return processedInvoices;
}

// --- HELPER DE CERTIFICADO ---
X509Certificate2? GetCertificate(string certName, string password)
{
    var certPath = Path.Combine(BaseCertPath, certName);
    if (!File.Exists(certPath))
    {
        var altPath = Path.Combine(BaseCertPath, certName.Replace(" ", "_"));
        if (File.Exists(altPath)) certPath = altPath;
        else return null;
    }

    try {
        return new X509Certificate2(certPath, password, X509KeyStorageFlags.EphemeralKeySet);
    } catch {
        // Fallback for Linux sometimes needing stricter flags
        return new X509Certificate2(certPath, password, X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.PersistKeySet | X509KeyStorageFlags.Exportable);
    }
}

// --- ENDPOINTS ---

app.MapPost("/api/upload-cert", async (HttpContext context) =>
{
    try 
    {
        Console.WriteLine("-> Recebendo upload de certificado...");
        if (!context.Request.HasFormContentType) return Results.BadRequest("Content-Type inválido.");
        var form = await context.Request.ReadFormAsync();
        var file = form.Files["file"]; 
        if (file == null || file.Length == 0) return Results.BadRequest("Arquivo vazio.");
        var fileName = Path.GetFileName(file.FileName);
        var safeFileName = fileName.Replace(" ", "_");
        var filePath = Path.Combine(BaseCertPath, safeFileName);
        
        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }
        return Results.Ok(new { message = "Upload realizado", filename = safeFileName });
    }
    catch (Exception ex)
    {
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
        var parsed = JsonConvert.DeserializeObject(body);
        // FIX: Resolvendo ambiguidade entre Newtonsoft.Json.Formatting e System.Xml.Formatting
        var indented = JsonConvert.SerializeObject(parsed, Newtonsoft.Json.Formatting.Indented);
        await File.WriteAllTextAsync(dbPath, indented);
        return Results.Ok(new { success = true });
    } catch (Exception ex) {
        return Results.Problem(ex.Message);
    }
});

// --- FUNÇÃO PARA MANIFESTAÇÃO (ENVIO DE EVENTO) ---
app.MapPost("/api/sefaz/manifest", async (HttpContext context) => {
    Console.WriteLine($"-> Manifestação do Destinatário");
    try
    {
        var requestBody = await new StreamReader(context.Request.Body).ReadToEndAsync();
        var json = JObject.Parse(requestBody);
        
        string xmlBody = json["xml"]?.ToString() ?? "";
        string password = json["password"]?.ToString() ?? "";
        string companyId = context.Request.Headers["X-Company-ID"].ToString();

        // Extrair ID do evento para assinatura
        var xDoc = XDocument.Parse(xmlBody);
        var infEvento = xDoc.Descendants().FirstOrDefault(x => x.Name.LocalName == "infEvento");
        string idEvento = infEvento?.Attribute("Id")?.Value ?? "";

        if (string.IsNullOrEmpty(companyId) || string.IsNullOrEmpty(idEvento)) return Results.BadRequest("Dados inválidos (CompanyID ou ID do Evento)");

        if (!File.Exists(dbPath)) return Results.NotFound("Banco de dados vazio");
        var dbContent = await File.ReadAllTextAsync(dbPath);
        var dbJson = JObject.Parse(dbContent);
        var company = dbJson["companies"]?.FirstOrDefault(c => c["id"]?.ToString() == companyId);
        if (company == null) return Results.NotFound("Empresa não encontrada");

        string certName = company["certificateName"]?.ToString() ?? "";
        var cert = GetCertificate(certName, password);
        if (cert == null) return Results.BadRequest("Certificado inválido ou não encontrado.");

        // 1. Assinar o XML
        string signedXml = SignXml(xmlBody, cert, idEvento);

        // 2. Envelopar SOAP
        var soapEnvelope = $@"<soap12:Envelope xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"" xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:soap12=""http://www.w3.org/2003/05/soap-envelope"">
            <soap12:Body>
                <nfeDadosMsg xmlns=""http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"">
                    {signedXml}
                </nfeDadosMsg>
            </soap12:Body>
        </soap12:Envelope>";

        // 3. Enviar
        var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(cert);
        handler.ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true; 

        using var client = new HttpClient(handler);
        client.Timeout = TimeSpan.FromSeconds(30);
        var url = "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";
        var content = new StringContent(soapEnvelope, Encoding.UTF8, "application/soap+xml");
        
        var response = await client.PostAsync(url, content);
        var responseXmlStr = await response.Content.ReadAsStringAsync();

        // 4. Processar Retorno
        var doc = XDocument.Parse(responseXmlStr);
        var retEvento = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "retEvento");
        
        string cStat = retEvento?.Element(retEvento.GetDefaultNamespace() + "infEvento")?.Element(retEvento.GetDefaultNamespace() + "cStat")?.Value ?? "0";
        string xMotivo = retEvento?.Element(retEvento.GetDefaultNamespace() + "infEvento")?.Element(retEvento.GetDefaultNamespace() + "xMotivo")?.Value ?? "Erro";

        return Results.Ok(new { cStat, xMotivo, raw = responseXmlStr });

    } catch (Exception ex) {
        Console.WriteLine($"[ERRO MANIFEST] {ex}");
        return Results.Problem($"Erro: {ex.Message}");
    }
});

// --- FUNÇÃO PARA DISTDFE (CONSULTA) ---
app.MapPost("/api/sefaz/dist-dfe", async (HttpContext context) => {
    Console.WriteLine($"-> Consulta Geral (NSU)");
    return await CallSefazDistDFe(context, false);
});

app.MapPost("/api/sefaz/fetch-xml", async (HttpContext context) => {
    Console.WriteLine($"-> Consulta Específica (Chave)");
    return await CallSefazDistDFe(context, true);
});

async Task<IResult> CallSefazDistDFe(HttpContext context, bool isSpecificKey = false)
{
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
        var cert = GetCertificate(certName, password);
        if (cert == null) return Results.BadRequest("Certificado inválido ou não encontrado.");

        var wsdlNamespace = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
        var soapEnvelope = $@"<soap12:Envelope xmlns:xsi=""http://www.w3.org/2001/XMLSchema-instance"" xmlns:xsd=""http://www.w3.org/2001/XMLSchema"" xmlns:soap12=""http://www.w3.org/2003/05/soap-envelope"">
            <soap12:Body>
                <nfeDistDFeInteresse xmlns=""{wsdlNamespace}"">
                    <nfeDadosMsg>{xmlBody}</nfeDadosMsg>
                </nfeDistDFeInteresse>
            </soap12:Body>
        </soap12:Envelope>";

        var handler = new HttpClientHandler();
        handler.ClientCertificates.Add(cert);
        handler.ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true; 

        using var client = new HttpClient(handler);
        client.Timeout = TimeSpan.FromSeconds(30);
        var url = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
        var content = new StringContent(soapEnvelope, Encoding.UTF8, "application/soap+xml");
        var actionUri = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";
        content.Headers.ContentType.Parameters.Add(new System.Net.Http.Headers.NameValueHeaderValue("action", $"\"{actionUri}\""));

        var response = await client.PostAsync(url, content);
        var responseXmlStr = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
            return Results.Problem(detail: $"SEFAZ retornou {response.StatusCode}. Detalhes: {responseXmlStr}", statusCode: (int)response.StatusCode);

        var doc = XDocument.Parse(responseXmlStr);
        XNamespace nsSoap = "http://www.w3.org/2003/05/soap-envelope";
        XNamespace nsNfe = "http://www.portalfiscal.inf.br/nfe";
        var body = doc.Descendants(nsSoap + "Body").FirstOrDefault();
        var retDistDFeInt = body?.Descendants(nsNfe + "retDistDFeInt").FirstOrDefault() ?? doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "retDistDFeInt");
        
        if (retDistDFeInt == null) return Results.Problem($"XML de resposta da SEFAZ inválido.");

        var cStat = retDistDFeInt.Element(nsNfe + "cStat")?.Value ?? retDistDFeInt.Element("cStat")?.Value;
        var xMotivo = retDistDFeInt.Element(nsNfe + "xMotivo")?.Value ?? retDistDFeInt.Element("xMotivo")?.Value;
        var maxNSU = retDistDFeInt.Element(nsNfe + "maxNSU")?.Value ?? retDistDFeInt.Element("maxNSU")?.Value;
        
        var processedInvoices = new List<object>();
        var lote = retDistDFeInt.Element(nsNfe + "loteDistDFeInt") ?? retDistDFeInt.Element("loteDistDFeInt");
        if (lote != null) {
            var docZips = lote.Elements(nsNfe + "docZip").Any() ? lote.Elements(nsNfe + "docZip") : lote.Elements("docZip");
            processedInvoices = ParseDocZips(docZips, companyId);
        }

        return Results.Ok(new { cStat, xMotivo, maxNSU, invoices = processedInvoices });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ERRO GERAL] {ex.ToString()}");
        return Results.Problem($"Erro Interno: {ex.Message}");
    }
}

app.Run();

string DecompressGZip(string base64)
{
    byte[] compressed = Convert.FromBase64String(base64);
    using var ms = new MemoryStream(compressed);
    using var gzip = new GZipStream(ms, CompressionMode.Decompress);
    using var reader = new StreamReader(gzip, Encoding.UTF8);
    return reader.ReadToEnd();
}