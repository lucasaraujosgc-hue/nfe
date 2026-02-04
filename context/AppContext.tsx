import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Company, Invoice, SystemLog } from '../types';
import { MOCK_COMPANIES, MOCK_INVOICES } from '../constants';
import { buildDistDFeInt } from '../utils/nfeXmlBuilders';

interface AppContextType {
  companies: Company[];
  invoices: Invoice[];
  logs: SystemLog[];
  addCompany: (company: Company) => void;
  updateCompany: (company: Company) => void;
  removeCompany: (id: string) => void;
  markAsDownloaded: (ids: string[]) => void;
  searchInvoices: (companyId: string) => Promise<void>;
  verifyCertificate: (file: File | null, password: string) => Promise<void>;
  clearLogs: () => void;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Dados exatos do exemplo SEFAZ Bahia fornecido
const SEFAZ_DATASET = [
  { numero: '000.164.944', cnpj: '08.617.092/0001-65', nome: 'VITALY NUTRICAO ANIMAL LTDA', emissao: '2025-12-29T10:07:40', autorizacao: '2025-12-29T10:15:49', valor: 777.79, chave: '29251208617092000165550020001649441502382887', uf: 'BA', tipo: 'Saida' },
  { numero: '000.059.062', cnpj: '42.823.156/0001-12', nome: 'VETMINAS NORDESTE PROD VETERINARIOS LTDA', emissao: '2026-01-19T16:59:28', autorizacao: '2026-01-19T16:59:41', valor: 1013.36, chave: '29260142823156000112550010000590621020590620', uf: 'BA', tipo: 'Saida' },
  { numero: '000.060.014', cnpj: '42.823.156/0001-12', nome: 'VETMINAS NORDESTE PROD VETERINARIOS LTDA', emissao: '2026-01-30T19:22:28', autorizacao: '2026-01-30T19:22:41', valor: 915.08, chave: '29260142823156000112550010000600141020600141', uf: 'BA', tipo: 'Saida' },
  { numero: '000.058.088', cnpj: '42.823.156/0001-12', nome: 'VETMINAS NORDESTE PROD VETERINARIOS LTDA', emissao: '2026-01-06T17:46:40', autorizacao: '2026-01-06T17:47:05', valor: 1079.28, chave: '29260142823156000112550010000580881020580880', uf: 'BA', tipo: 'Saida' },
  { numero: '000.163.531', cnpj: '01.588.099/0012-00', nome: 'Integral Agroindustrial Ltda - Paulo Afonso', emissao: '2026-01-07T14:28:35', autorizacao: '2026-01-07T14:29:20', valor: 3097.01, chave: '29260101588099001200550000001635311403596815', uf: 'BA', tipo: 'Saida' },
  { numero: '000.096.962', cnpj: '03.494.578/0001-30', nome: 'SUPRIVAC PRODUTOS AGROPECUARIOS LTD', emissao: '2026-01-12T11:02:37', autorizacao: '2026-01-12T11:02:39', valor: 763.30, chave: '29260103494578000130550010000969621170851881', uf: 'BA', tipo: 'Saida' },
  { numero: '000.164.091', cnpj: '01.588.099/0012-00', nome: 'Integral Agroindustrial Ltda - Paulo Afonso', emissao: '2026-01-15T17:45:17', autorizacao: '2026-01-15T17:45:53', valor: 3303.78, chave: '29260101588099001200550000001640911512208994', uf: 'BA', tipo: 'Saida' },
  { numero: '001.604.657', cnpj: '23.797.376/0027-03', nome: 'BARTOFIL DISTRIBUIDORA SA', emissao: '2026-01-19T21:03:18', autorizacao: '2026-01-19T21:09:23', valor: 1680.49, chave: '29260123797376002703550000016046571520266330', uf: 'BA', tipo: 'Saida' },
  { numero: '000.191.437', cnpj: '00.776.806/0014-90', nome: 'CONFINAR PRODUTOS AGROPECUARIOS LTDA', emissao: '2026-01-20T08:30:15', autorizacao: '2026-01-20T08:30:25', valor: 770.98, chave: '29260100776806001490550010001914371001289923', uf: 'BA', tipo: 'Saida' },
  { numero: '000.191.851', cnpj: '00.776.806/0014-90', nome: 'CONFINAR PRODUTOS AGROPECUARIOS LTDA', emissao: '2026-01-23T08:13:47', autorizacao: '2026-01-23T08:13:56', valor: 428.40, chave: '29260100776806001490550010001918511001293271', uf: 'BA', tipo: 'Saida' },
  { numero: '000.191.857', cnpj: '00.776.806/0014-90', nome: 'CONFINAR PRODUTOS AGROPECUARIOS LTDA', emissao: '2026-01-23T08:18:35', autorizacao: '2026-01-23T08:18:41', valor: 483.86, chave: '29260100776806001490550010001918571001293267', uf: 'BA', tipo: 'Saida' },
  { numero: '000.325.578', cnpj: '19.628.684/0003-60', nome: 'GB ATACADISTAS LTDA', emissao: '2026-01-25T11:35:14', autorizacao: '2026-01-25T11:40:06', valor: 1564.00, chave: '29260119628684000360550010003255781332875672', uf: 'BA', tipo: 'Saida' },
  { numero: '000.192.800', cnpj: '00.776.806/0014-90', nome: 'CONFINAR PRODUTOS AGROPECUARIOS LTDA', emissao: '2026-01-29T17:35:23', autorizacao: '2026-01-29T17:35:26', valor: 483.86, chave: '29260100776806001490550010001928001000056735', uf: 'BA', tipo: 'Entrada' },
  { numero: '000.192.801', cnpj: '00.776.806/0014-90', nome: 'CONFINAR PRODUTOS AGROPECUARIOS LTDA', emissao: '2026-01-29T17:36:02', autorizacao: '2026-01-29T17:36:05', valor: 419.14, chave: '29260100776806001490550010001928011001298284', uf: 'BA', tipo: 'Saida' },
  { numero: '000.600.850', cnpj: '08.589.429/0010-69', nome: 'NUTRISANTOS ALIMENTACAO ANIMAL LTDA', emissao: '2026-01-31T09:00:32', autorizacao: '2026-01-31T09:05:04', valor: 1451.87, chave: '31260108589429001069550010006008501175266727', uf: 'MG', tipo: 'Saida' }
];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/db')
      .then(res => {
        if (!res.ok) throw new Error('Falha ao carregar dados');
        return res.json();
      })
      .then(data => {
        if (data.companies) setCompanies(data.companies);
        if (data.invoices) setInvoices(data.invoices);
        setIsDataLoaded(true);
        console.log('Dados carregados de /app/data/db.json');
      })
      .catch(err => {
        console.error("Erro ao conectar com API de persistência:", err);
        setCompanies(MOCK_COMPANIES);
        setInvoices(MOCK_INVOICES);
        setIsDataLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!isDataLoaded) return;

    const dbData = {
      companies,
      invoices,
      lastUpdated: new Date().toISOString()
    };

    fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbData)
    }).catch(err => console.error("Erro ao salvar dados no disco:", err));

  }, [companies, invoices, isDataLoaded]);

  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', details?: string) => {
    setLogs(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details
    }]);
  };

  const clearLogs = () => setLogs([]);

  const addCompany = (company: Company) => {
    setCompanies(prev => [...prev, { ...company, lastNSU: '0' }]);
    addLog(`Empresa ${company.apelido} cadastrada com sucesso.`, 'success');
  };

  const updateCompany = (updatedCompany: Company) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
    addLog(`Dados da empresa ${updatedCompany.apelido} atualizados.`, 'info');
  };

  const removeCompany = (id: string) => {
    const comp = companies.find(c => c.id === id);
    setCompanies(prev => prev.filter(c => c.id !== id));
    setInvoices(prev => prev.filter(inv => inv.companyId !== id));
    addLog(`Empresa ${comp?.apelido || id} removida.`, 'warning');
  };

  const markAsDownloaded = (ids: string[]) => {
    setInvoices(prev => prev.map(inv => 
      ids.includes(inv.id) ? { ...inv, downloaded: true } : inv
    ));
    addLog(`${ids.length} notas marcadas como baixadas (XML salvo em disco).`, 'success');
  };

  const verifyCertificate = async (file: File | null, password: string): Promise<void> => {
    if (!file && !password) return;
    await new Promise(r => setTimeout(r, 1500));
    if (password !== '123456') {
        throw new Error("Senha incorreta. Falha ao decifrar o arquivo .pfx (OpenSSL Mac Verify Error).");
    }
  };

  const searchInvoices = async (companyId: string) => {
    setIsLoading(true);
    clearLogs();
    
    const company = companies.find(c => c.id === companyId);
    if (!company) {
      addLog("Erro interno: Empresa não encontrada no contexto.", "error");
      setIsLoading(false);
      return;
    }

    try {
      addLog(`Iniciando job de consulta DFe para: ${company.razaoSocial}`, 'info');
      await new Promise(r => setTimeout(r, 600));

      addLog(`Lendo arquivo de certificado: ${company.certificateName || 'cert.pfx'}`, 'info');
      await new Promise(r => setTimeout(r, 800));

      addLog("Tentando decifrar chave privada (OpenSSL PKCS#12)...", 'info');
      await new Promise(r => setTimeout(r, 800));

      if (company.certificatePassword !== '123456') {
        throw new Error("OpenSSL Error: mac verify failure. Invalid password?");
      }
      
      addLog("Certificado decifrado com sucesso. Validade: 31/12/2026", 'success');
      await new Promise(r => setTimeout(r, 500));

      addLog(`Gerando XML distDFeInt (NSU: ${company.lastNSU})...`, 'info');
      const xmlBody = buildDistDFeInt(company.cnpj, company.lastNSU);
      addLog("Payload XML gerado:", 'info', xmlBody);
      await new Promise(r => setTimeout(r, 600));

      addLog("Abrindo conexão SSL Mutual com https://www1.nfe.fazenda.gov.br/...", 'warning');
      await new Promise(r => setTimeout(r, 1500));

      // LÓGICA MOCKADA PARA RETORNAR O DATASET SEFAZ BAHIA
      const currentNSU = parseInt(company.lastNSU);
      
      // Simula paginação: Pega os próximos 5 itens do dataset ou o restante
      // Se currentNSU for 0, começa do index 0. Se for 5, começa do index 5.
      const startIndex = currentNSU % SEFAZ_DATASET.length; 
      
      // Para simular que "encontrou novos", vamos apenas retornar o dataset inteiro se NSU < length,
      // ou parte dele para parecer incremental
      let itemsToReturn: any[] = [];
      
      if (currentNSU < SEFAZ_DATASET.length) {
         itemsToReturn = SEFAZ_DATASET.slice(currentNSU, currentNSU + 5);
      }

      if (itemsToReturn.length > 0) {
        addLog("Resposta SEFAZ recebida. HTTP 200 OK.", 'success');
        addLog("Processando retorno SOAP (GZip decompression)...", 'info');
        
        const newInvoices: Invoice[] = itemsToReturn.map((item, index) => ({
            id: `inv-${Date.now()}-${index}`,
            companyId: companyId,
            accessKey: item.chave,
            nsu: String(currentNSU + index + 1).padStart(15, '0'),
            numero: item.numero,
            serie: '1',
            emitenteName: item.nome,
            emitenteCNPJ: item.cnpj,
            emissionDate: item.emissao,
            authorizationDate: item.autorizacao,
            amount: item.valor,
            status: 'authorized',
            downloaded: false,
            uf: item.uf,
            operationType: item.tipo
        }));

        const maxNSU = currentNSU + newInvoices.length;
        updateCompany({ ...company, lastNSU: maxNSU.toString() });

        setInvoices(prev => {
          const existingIds = new Set(prev.map(i => i.accessKey));
          const uniqueNew = newInvoices.filter(i => !existingIds.has(i.accessKey));
          return [...uniqueNew, ...prev];
        });

        addLog(`Sucesso: ${newInvoices.length} novos documentos localizados (cStat: 138).`, 'success');
        addLog(`Cursor de NSU atualizado para: ${maxNSU}`, 'info');

      } else {
        // Se já percorreu todo o dataset mockado, reseta o NSU para demonstrar de novo ou diz que não tem
        if (currentNSU >= SEFAZ_DATASET.length) {
             addLog("Resposta SEFAZ recebida. HTTP 200 OK.", 'success');
             addLog("cStat: 137 - Nenhum documento localizado para o NSU informado.", 'warning');
             // Opcional: Resetar NSU para demo
             // updateCompany({ ...company, lastNSU: '0' }); 
        }
      }

    } catch (err: any) {
      addLog(`FALHA CRÍTICA: ${err.message}`, 'error');
      console.error(err);
    } finally {
      setIsLoading(false);
      addLog("Processo finalizado.", 'info');
    }
  };

  return (
    <AppContext.Provider value={{ 
      companies, 
      invoices, 
      logs,
      addCompany, 
      updateCompany, 
      removeCompany, 
      markAsDownloaded, 
      searchInvoices, 
      verifyCertificate,
      clearLogs,
      isLoading
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};