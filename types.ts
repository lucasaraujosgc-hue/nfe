export interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  apelido: string;
  certificateName?: string;
  certificateExpiry?: string;
  certificatePassword?: string; // Armazenado apenas para simulação do Backend
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
  authorizationDate?: string; // ISO String
  amount: number;
  status: 'authorized' | 'canceled' | 'denied';
  downloaded: boolean;
  uf?: string; // UF do Emitente
  operationType?: string; // 'Entrada' | 'Saida'
}

export type InvoiceFilter = {
  companyId: string;
  startDate: string;
  endDate: string;
};

export interface SystemLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
}