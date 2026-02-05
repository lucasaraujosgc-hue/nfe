import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Company, Invoice, SystemLog } from '../types';
import { buildDistDFeInt, buildConsChNFe, buildManifestacaoXml } from '../utils/nfeXmlBuilders';

interface AppContextType {
  companies: Company[];
  invoices: Invoice[];
  logs: SystemLog[];
  addCompany: (company: Company) => void;
  updateCompany: (company: Company) => void;
  removeCompany: (id: string) => void;
  markAsDownloaded: (ids: string[]) => void;
  searchInvoices: (companyId: string) => Promise<void>;
  fetchFullXml: (companyId: string, accessKey: string) => Promise<boolean>; // Changed return to boolean
  manifestInvoice: (companyId: string, accessKey: string) => Promise<boolean>; // Nova função
  verifyCertificate: (file: File | null, password: string) => Promise<void>;
  clearLogs: () => void;
  isLoading: boolean;
  isError: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 1. Carregar dados do banco de dados local
  useEffect(() => {
    const timeout = setTimeout(() => {
        fetch('/api/db')
          .then(res => {
            if (!res.ok) throw new Error('Falha ao carregar dados');
            return res.json();
          })
          .then(data => {
            if (data.companies) setCompanies(data.companies);
            if (data.invoices) setInvoices(data.invoices);
            setIsDataLoaded(true); 
            setIsError(false);
            console.log('Dados carregados com sucesso.');
          })
          .catch(err => {
            console.error("ERRO CRÍTICO DB:", err);
            setIsError(true); 
          });
    }, 1000);
    return () => clearTimeout(timeout);
  }, []);

  // 2. Salvar dados no servidor
  useEffect(() => {
    if (!isDataLoaded || isError) return;
    const dbData = { companies, invoices, lastUpdated: new Date().toISOString() };
    fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbData)
    }).catch(err => console.error("Erro ao salvar dados:", err));
  }, [companies, invoices, isDataLoaded, isError]);

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
    addLog(`Empresa ${company.apelido} cadastrada.`, 'success');
  };

  const updateCompany = (updatedCompany: Company) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
    addLog(`Empresa ${updatedCompany.apelido} atualizada.`, 'info');
  };

  const removeCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
    setInvoices(prev => prev.filter(inv => inv.companyId !== id));
    addLog(`Empresa removida.`, 'warning');
  };

  const markAsDownloaded = (ids: string[]) => {
    setInvoices(prev => prev.map(inv => 
      ids.includes(inv.id) ? { ...inv, downloaded: true } : inv
    ));
    addLog(`${ids.length} notas marcadas como baixadas.`, 'success');
  };

  const verifyCertificate = async (file: File | null, password: string): Promise<void> => {
    if (file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/upload-cert', { method: 'POST', body: formData });
            if (!res.ok) throw new Error("Falha no upload");
        } catch (e: any) {
            throw new Error(`Upload falhou: ${e.message}`);
        }
    }
    if (!password) throw new Error("Senha é obrigatória.");
  };

  // --- MANIFESTAR (CIÊNCIA DA OPERAÇÃO) ---
  const manifestInvoice = async (companyId: string, accessKey: string): Promise<boolean> => {
      setIsLoading(true);
      const company = companies.find(c => c.id === companyId);
      if (!company) { setIsLoading(false); return false; }
      
      try {
          addLog(`Iniciando Manifestação (Ciência da Operação)...`, 'info', accessKey);
          const xmlPayload = buildManifestacaoXml(company.cnpj, accessKey);

          const response = await fetch('/api/sefaz/manifest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Company-ID': companyId },
              body: JSON.stringify({ xml: xmlPayload, password: company.certificatePassword })
          });

          if (!response.ok) throw new Error("Erro comunicação SEFAZ (Recepção Evento)");
          const data = await response.json();
          
          if (data.cStat === '135' || data.cStat === '136' || data.cStat === '573') {
              // 135: Evento vinculado, 136: Evento registrado, 573: Duplicidade (já feito)
              addLog(`Manifestação realizada com sucesso! (Cód: ${data.cStat})`, 'success', data.xMotivo);
              return true;
          } else {
              addLog(`Falha na manifestação: ${data.xMotivo}`, 'error', `cStat: ${data.cStat}`);
              return false;
          }
      } catch (err: any) {
          addLog(`Erro ao manifestar: ${err.message}`, 'error');
          return false;
      } finally {
          setIsLoading(false);
      }
  };

  // --- BUSCAR XML COMPLETO POR CHAVE ---
  const fetchFullXml = async (companyId: string, accessKey: string): Promise<boolean> => {
      setIsLoading(true);
      const company = companies.find(c => c.id === companyId);
      if (!company) { setIsLoading(false); return false; }

      try {
          addLog(`Tentando baixar XML Completo para a nota...`, 'info', accessKey);
          const xmlPayload = buildConsChNFe(company.cnpj, accessKey);

          const response = await fetch('/api/sefaz/fetch-xml', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Company-ID': companyId },
              body: JSON.stringify({ xml: xmlPayload, password: company.certificatePassword })
          });

          if (!response.ok) throw new Error("Erro na comunicação com Backend");
          const data = await response.json();

          if (data.invoices && data.invoices.length > 0) {
              const fullInvoice = data.invoices[0];
              
              // Verificação crucial: O XML retornado é realmente completo (procNFe) ou é outro Resumo?
              const isFullXml = fullInvoice.originalXml && fullInvoice.originalXml.includes('procNFe');

              // Atualiza a nota existente com os novos dados
              setInvoices(prev => prev.map(inv => {
                  if (inv.accessKey === accessKey) {
                      return { ...inv, ...fullInvoice, id: inv.id }; // Mantém o ID interno original
                  }
                  return inv;
              }));

              if (isFullXml) {
                  addLog(`Sucesso! XML Completo (procNFe) obtido e atualizado.`, 'success');
                  return true;
              } else {
                  addLog(`Aviso: A SEFAZ retornou apenas o Resumo.`, 'warning');
                  return false;
              }

          } else {
              addLog(`SEFAZ não retornou o XML. Motivo: ${data.xMotivo}`, 'warning');
              return false;
          }

      } catch (err: any) {
          addLog(`Erro ao buscar XML: ${err.message}`, 'error');
          return false;
      } finally {
          setIsLoading(false);
      }
  };

  const searchInvoices = async (companyId: string) => {
    setIsLoading(true);
    clearLogs();
    
    const company = companies.find(c => c.id === companyId);
    if (!company) { setIsLoading(false); return; }

    try {
      addLog(`Sincronizando com SEFAZ (NSU: ${company.lastNSU})...`, 'info');
      
      const xmlPayload = buildDistDFeInt(company.cnpj, company.lastNSU);
      
      const response = await fetch('/api/sefaz/dist-dfe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Company-ID': companyId },
          body: JSON.stringify({ xml: xmlPayload, password: company.certificatePassword })
      });

      if (!response.ok) throw new Error("Erro Servidor");
      const data = await response.json();
      
      if (data.invoices && data.invoices.length > 0) {
           const newInvoices: Invoice[] = data.invoices;
           setInvoices(prev => {
              const existingIds = new Set(prev.map(i => i.accessKey));
              const uniqueNew = newInvoices.filter(i => !existingIds.has(i.accessKey));
              return [...uniqueNew, ...prev];
            });
            if (data.maxNSU) updateCompany({ ...company, lastNSU: data.maxNSU });
            addLog(`Sucesso: ${newInvoices.length} notas novas.`, 'success');
      } else {
          if (data.cStat !== '138' && data.cStat !== '137') {
              addLog(`SEFAZ: ${data.cStat} - ${data.xMotivo}`, 'warning');
          } else {
              addLog("Nenhuma nota nova encontrada.", 'success');
              if (data.maxNSU && data.maxNSU !== company.lastNSU) {
                  updateCompany({ ...company, lastNSU: data.maxNSU });
              }
          }
      }

    } catch (err: any) {
      addLog(`FALHA: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppContext.Provider value={{ 
      companies, invoices, logs,
      addCompany, updateCompany, removeCompany, 
      markAsDownloaded, searchInvoices, fetchFullXml, manifestInvoice,
      verifyCertificate, clearLogs,
      isLoading, isError
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