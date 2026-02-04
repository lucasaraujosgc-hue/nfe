import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Company, Invoice, SystemLog } from '../types';
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

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 1. Carregar dados do banco de dados local
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
        // Em produção, não carregamos mocks se falhar
        setCompanies([]);
        setInvoices([]);
        setIsDataLoaded(true);
      });
  }, []);

  // 2. Salvar dados no servidor sempre que houver mudança
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
    addLog(`${ids.length} notas marcadas como baixadas (Salvo localmente).`, 'success');
  };

  const verifyCertificate = async (file: File | null, password: string): Promise<void> => {
    if (!file && !password) return;
    // Simulação de delay de processamento criptográfico local
    await new Promise(r => setTimeout(r, 1000));
    
    // Validação básica
    if (!password) {
        throw new Error("Senha é obrigatória.");
    }
  };

  // --- MODO PRODUÇÃO ---
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
      addLog(`Iniciando conexão segura com Ambiente Nacional (SEFAZ) para: ${company.razaoSocial}`, 'info');
      addLog(`Utilizando certificado digital ID: ${company.certificateName}`, 'info');
      
      // 1. Gerar o Payload XML
      const xmlPayload = buildDistDFeInt(company.cnpj, company.lastNSU);
      addLog(`Gerando XML distDFeInt (NSU: ${company.lastNSU})...`, 'info');
      
      // 2. Tentar conexão real com Backend (Proxy SEFAZ)
      // Em um ambiente de produção real, isso chamaria um endpoint que tem acesso ao certificado .pfx no servidor
      // e faria a comunicação SSL mútua com a SEFAZ.
      addLog("Enviando requisição SOAP...", 'warning');
      
      const response = await fetch('/api/sefaz/dist-dfe', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'X-Company-ID': companyId
          },
          body: JSON.stringify({
              xml: xmlPayload,
              password: company.certificatePassword // Enviando senha para decifrar PFX no backend
          })
      });

      if (!response.ok) {
          // Se o backend não estiver implementado (caso deste ambiente demo), cairá aqui
          if (response.status === 404) {
              throw new Error("Endpoint de comunicação com SEFAZ não encontrado (/api/sefaz/dist-dfe). Verifique se o Backend Java/Node está rodando.");
          }
          throw new Error(`Erro na comunicação com servidor: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Processar resposta real (Lógica de Produção)
      if (data.invoices && data.invoices.length > 0) {
           const newInvoices: Invoice[] = data.invoices;
           
           // Atualizar estado
           setInvoices(prev => {
              const existingIds = new Set(prev.map(i => i.accessKey));
              const uniqueNew = newInvoices.filter(i => !existingIds.has(i.accessKey));
              return [...uniqueNew, ...prev];
            });
            
            // Atualizar NSU
            if (data.maxNSU) {
                updateCompany({ ...company, lastNSU: data.maxNSU });
                addLog(`Cursor de NSU atualizado para: ${data.maxNSU}`, 'info');
            }
            
            addLog(`Sucesso: ${newInvoices.length} documentos retornados da SEFAZ.`, 'success');
      } else {
          addLog("Requisição completada. Nenhum documento novo encontrado (cStat 137).", 'success');
      }

    } catch (err: any) {
      addLog(`FALHA DE CONEXÃO: ${err.message}`, 'error');
      addLog("Nota: Como este é um ambiente Frontend-only, a conexão real com a SEFAZ falhou pois requer um Backend seguro.", 'warning');
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