// Utilitários para gerar o XML da SEFAZ (NT 2014.002)

export const buildDistDFeInt = (cnpj: string, ultNSU: string, tpAmb: string = '1') => {
  // O ultNSU deve ter exatamente 15 dígitos com zeros à esquerda
  const paddedNSU = ultNSU.padStart(15, '0');
  
  // Remove formatação do CNPJ para enviar apenas números
  const cleanCNPJ = cnpj.replace(/\D/g, '');

  // NOTA: Removemos cUFAutor pois ele é opcional para empresas privadas (exceto Órgãos Públicos).
  // Enviar uma UF fixa (ex: 35) se a empresa for de outra UF pode causar rejeição.
  return `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${tpAmb}</tpAmb><CNPJ>${cleanCNPJ}</CNPJ><distNSU><ultNSU>${paddedNSU}</ultNSU></distNSU></distDFeInt>`;
};

export const buildConsChNFe = (cnpj: string, chNFe: string, tpAmb: string = '1') => {
  const cleanCNPJ = cnpj.replace(/\D/g, '');
  
  return `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${tpAmb}</tpAmb><CNPJ>${cleanCNPJ}</CNPJ><consChNFe><chNFe>${chNFe}</chNFe></consChNFe></distDFeInt>`;
};