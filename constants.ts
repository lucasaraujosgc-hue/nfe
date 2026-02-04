import { Company, Invoice } from './types';

export const MOCK_COMPANIES: Company[] = [
  {
    id: '1',
    cnpj: '12.345.678/0001-90',
    razaoSocial: 'Tech Solutions Ltda',
    apelido: 'Tech Sol',
    certificateName: 'cert_tech_2024.pfx',
    certificateExpiry: '2024-12-31',
  },
  {
    id: '2',
    cnpj: '98.765.432/0001-10',
    razaoSocial: 'Comércio de Alimentos Silva',
    apelido: 'Silva Alimentos',
    certificateName: 'silva_nfe.pfx',
    certificateExpiry: '2025-05-15',
  }
];

export const MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv-001',
    companyId: '1',
    accessKey: '35230912345678000190550010000012341000012345',
    nsu: '000000000015340',
    numero: '1234',
    serie: '1',
    emitenteName: 'Fornecedor de Hardware S.A.',
    emitenteCNPJ: '11.111.111/0001-11',
    emissionDate: '2023-10-01T10:00:00',
    amount: 15450.00,
    status: 'authorized',
    downloaded: true,
  },
  {
    id: 'inv-002',
    companyId: '1',
    accessKey: '35230987654321000190550010000056781000056789',
    nsu: '000000000015341',
    numero: '5678',
    serie: '2',
    emitenteName: 'Serviços de Nuvem Ltda',
    emitenteCNPJ: '22.222.222/0001-22',
    emissionDate: '2023-10-05T14:30:00',
    amount: 590.50,
    status: 'authorized',
    downloaded: false,
  },
  {
    id: 'inv-003',
    companyId: '2',
    accessKey: '35231012345678000190550010000099991000099999',
    nsu: '000000000015342',
    numero: '9999',
    serie: '1',
    emitenteName: 'Distribuidora de Bebidas X',
    emitenteCNPJ: '33.333.333/0001-33',
    emissionDate: '2023-10-10T08:15:00',
    amount: 2340.00,
    status: 'canceled',
    downloaded: false,
  },
];