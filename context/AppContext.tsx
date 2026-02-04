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
  clearLogs: () => void;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Flag para indicar que os dados iniciais foram carregados do servidor
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 1. Carregar dados do servidor (FileSystem) ao iniciar
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
        // Fallback apenas visual se falhar (ex: rodando sem backend configurado)
        setCompanies(MOCK_COMPANIES);
        setInvoices(MOCK_INVOICES);
        setIsDataLoaded(true);
      });
  }, []);

  // 2. Salvar dados no servidor sempre que houver mudança
  useEffect(() => {
    // Não salva se ainda não carregou para evitar sobrescrever o banco com array vazio
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

  // --- SIMULAÇÃO DO BACKEND (Mantida a lógica de busca) ---
  const searchInvoices = async (companyId: string) => {
    setIsLoading(true);
    clearLogs(); // Limpa logs anteriores para nova execução
    
    const company = companies.find(c => c.id === companyId);
    if (!company) {
      addLog("Erro interno: Empresa não encontrada no contexto.", "error");
      setIsLoading(false);
      return;
    }

    try {
      // 1. Início do Processo
      addLog(`Iniciando job de consulta DFe para: ${company.razaoSocial}`, 'info');
      await new Promise(r => setTimeout(r, 600));

      // 2. Carregamento do Certificado
      addLog(`Lendo arquivo de certificado: ${company.certificateName || 'cert.pfx'}`, 'info');
      await new Promise(r => setTimeout(r, 800));

      // 3. Validação da Senha (OpenSSL Simulation)
      addLog("Tentando decifrar chave privada (OpenSSL PKCS#12)...", 'info');
      await new Promise(r => setTimeout(r, 800));

      // LÓGICA DE VALIDAÇÃO DE SENHA (MOCK)
      if (company.certificatePassword !== '123456') {
        throw new Error("OpenSSL Error: mac verify failure. Invalid password?");
      }
      
      addLog("Certificado decifrado com sucesso. Validade: 31/12/2025", 'success');
      await new Promise(r => setTimeout(r, 500));

      // 4. Geração do XML
      addLog(`Gerando XML distDFeInt (NSU: ${company.lastNSU})...`, 'info');
      const xmlBody = buildDistDFeInt(company.cnpj, company.lastNSU);
      addLog("Payload XML gerado:", 'info', xmlBody);
      await new Promise(r => setTimeout(r, 600));

      // 5. Conexão SOAP
      addLog("Abrindo conexão SSL Mutual com https://www1.nfe.fazenda.gov.br/...", 'warning');
      await new Promise(r => setTimeout(r, 1500)); // Latência de rede

      // 6. Resposta da SEFAZ
      const foundNewDocs = Math.random() > 0.3; 
      
      if (foundNewDocs) {
        addLog("Resposta SEFAZ recebida. HTTP 200 OK.", 'success');
        addLog("Processando retorno SOAP (GZip decompression)...", 'info');
        
        // Gera notas mockadas baseadas no NSU atual
        const startNSU = parseInt(company.lastNSU);
        const qtd = Math.floor(Math.random() * 5) + 1;
        const newInvoices: Invoice[] = [];

        for (let i = 1; i <= qtd; i++) {
          const currentNSU = startNSU + i;
          newInvoices.push({
            id: `inv-${Date.now()}-${i}`,
            companyId: companyId,
            accessKey: `35${new Date().getFullYear()}000000000000000000000000${String(currentNSU).padStart(9, '0')}`,
            nsu: String(currentNSU).padStart(15, '0'),
            numero: String(1000 + currentNSU),
            serie: '1',
            emitenteName: `Fornecedor Simulado ${currentNSU}`,
            emitenteCNPJ: '00.000.000/0001-91',
            emissionDate: new Date().toISOString(),
            amount: Math.random() * 5000,
            status: 'authorized',
            downloaded: false,
          });
        }

        const maxNSU = startNSU + qtd;
        updateCompany({ ...company, lastNSU: maxNSU.toString() });

        setInvoices(prev => {
          const existingIds = new Set(prev.map(i => i.accessKey));
          const uniqueNew = newInvoices.filter(i => !existingIds.has(i.accessKey));
          return [...uniqueNew, ...prev];
        });

        addLog(`Sucesso: ${qtd} novos documentos localizados (cStat: 138).`, 'success');
        addLog(`Cursor de NSU atualizado para: ${maxNSU}`, 'info');

      } else {
        addLog("Resposta SEFAZ recebida. HTTP 200 OK.", 'success');
        addLog("cStat: 137 - Nenhum documento localizado para o NSU informado.", 'warning');
        addLog("Dica: Aguarde 1 hora antes de consultar novamente este CNPJ.", 'info');
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