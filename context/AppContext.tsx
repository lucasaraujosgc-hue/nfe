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
    // 1. Upload do Arquivo para o Backend
    if (file) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            console.log("Enviando certificado para o backend...");
            const res = await fetch('/api/upload-cert', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                let errorDetails = res.statusText;
                try {
                    // Tenta ler como JSON (ProblemDetails do .NET)
                    const jsonError = await res.json();
                    if (jsonError.detail) errorDetails = jsonError.detail;
                    else if (jsonError.title) errorDetails = jsonError.title;
                    else if (jsonError.message) errorDetails = jsonError.message;
                } catch (e) {
                    // Fallback para texto plano se não for JSON
                    try { errorDetails = await res.text(); } catch {}
                }
                
                // Limpeza de string caso venha com aspas extras
                if (typeof errorDetails === 'string') {
                    errorDetails = errorDetails.replace(/^"|"$/g, '');
                }
                
                throw new Error(`Servidor: ${errorDetails} (Cod: ${res.status})`);
            }
            console.log("Upload concluído.");
        } catch (e: any) {
            console.error(e);
            throw new Error(`Falha no upload do certificado: ${e.message}`);
        }
    }
    
    // 2. Validação simples de input
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
      addLog("Enviando requisição SOAP via Backend C#...", 'warning');
      
      let response;
      try {
          response = await fetch('/api/sefaz/dist-dfe', {
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
      } catch (netErr) {
          throw new Error("Não foi possível conectar ao servidor Backend na porta 5000. Verifique se ele está rodando.");
      }

      if (!response.ok) {
          let errorMsg = response.statusText;
          try {
             // Tenta extrair a mensagem detalhada (JSON Problem Details ou texto)
             const textBody = await response.text();
             try {
                const jsonBody = JSON.parse(textBody);
                // Se for ProblemDetails do ASP.NET
                if (jsonBody.detail) errorMsg = jsonBody.detail;
                else if (jsonBody.title) errorMsg = jsonBody.title;
                else errorMsg = textBody;
             } catch {
                if (textBody) errorMsg = textBody.replace(/^"|"$/g, '');
             }
          } catch (e) { /* ignore parse error */ }

          if (response.status === 404) {
              throw new Error("Rota do Backend não encontrada (404).");
          }
          
          throw new Error(`Erro Servidor (${response.status}): ${errorMsg}`);
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
          // Se houve erro na SEFAZ (cStat != 138 e != 137)
          if (data.cStat !== '138' && data.cStat !== '137') {
              addLog(`SEFAZ retornou: ${data.cStat} - ${data.xMotivo}`, 'warning');
          } else {
              addLog("Requisição completada. Nenhum documento novo encontrado.", 'success');
              // Atualiza NSU mesmo se vazio, para não consultar o mesmo intervalo
              if (data.maxNSU && data.maxNSU !== company.lastNSU) {
                  updateCompany({ ...company, lastNSU: data.maxNSU });
                  addLog(`Cursor avançado para NSU: ${data.maxNSU}`, 'info');
              }
          }
      }

    } catch (err: any) {
      addLog(`FALHA: ${err.message}`, 'error');
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