export interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  apelido: string;
  certificateName?: string;
  certificateExpiry?: string;
  lastNSU: string; // Controle do último NSU consultado (Max 15 dígitos)
}

export interface Invoice {
  id: string;
  companyId: string; // The receiver (destinatário)
  accessKey: string;
  nsu: string; // Número Sequencial Único
  numero: string;
  serie: string;
  emitenteName: string;
  emitenteCNPJ: string;
  emissionDate: string; // ISO String
  amount: number;
  status: 'authorized' | 'canceled' | 'denied';
  downloaded: boolean;
}

export type InvoiceFilter = {
  companyId: string;
  startDate: string;
  endDate: string;
};