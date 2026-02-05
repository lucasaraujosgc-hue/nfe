// Utilitários para gerar o XML da SEFAZ (NT 2014.002 e Eventos)

export const buildDistDFeInt = (cnpj: string, ultNSU: string, tpAmb: string = '1') => {
  // O ultNSU deve ter exatamente 15 dígitos com zeros à esquerda
  const paddedNSU = ultNSU.padStart(15, '0');
  const cleanCNPJ = cnpj.replace(/\D/g, '');

  return `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${tpAmb}</tpAmb><CNPJ>${cleanCNPJ}</CNPJ><distNSU><ultNSU>${paddedNSU}</ultNSU></distNSU></distDFeInt>`;
};

export const buildConsChNFe = (cnpj: string, chNFe: string, tpAmb: string = '1') => {
  const cleanCNPJ = cnpj.replace(/\D/g, '');
  return `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${tpAmb}</tpAmb><CNPJ>${cleanCNPJ}</CNPJ><consChNFe><chNFe>${chNFe}</chNFe></consChNFe></distDFeInt>`;
};

// Constrói o XML de evento para Manifestação do Destinatário
// tpEvento: 210210 = Ciência da Operação (Permite download do XML)
//           210200 = Confirmação da Operação
export const buildManifestacaoXml = (cnpj: string, chNFe: string, tpEvento: string = '210210', tpAmb: string = '1') => {
  const cleanCNPJ = cnpj.replace(/\D/g, '');
  const timezone = new Date().toISOString().slice(0, 19) + '-03:00'; // Hardcoded SP timezone for simplicity
  const idEvento = `ID${tpEvento}${chNFe}01`; // 01 é o nSeqEvento

  return `<envEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <idLote>1</idLote>
    <evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <infEvento Id="${idEvento}">
            <cOrgao>91</cOrgao>
            <tpAmb>${tpAmb}</tpAmb>
            <CNPJ>${cleanCNPJ}</CNPJ>
            <chNFe>${chNFe}</chNFe>
            <dhEvento>${timezone}</dhEvento>
            <tpEvento>${tpEvento}</tpEvento>
            <nSeqEvento>1</nSeqEvento>
            <verEvento>1.00</verEvento>
            <detEvento versao="1.00">
                <descEvento>Ciencia da Operacao</descEvento>
            </detEvento>
        </infEvento>
    </evento>
</envEvento>`;
};