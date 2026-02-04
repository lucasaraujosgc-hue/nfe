import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Company, Invoice } from '../types';
import { MOCK_COMPANIES, MOCK_INVOICES } from '../constants';
import { buildDistDFeInt } from '../utils/nfeXmlBuilders';

interface AppContextType {
  companies: Company[];
  invoices: Invoice[];
  addCompany: (company: Company) => void;
  updateCompany: (company: Company) => void;
  removeCompany: (id: string) => void;
  markAsDownloaded: (ids: string[]) => void;
  searchInvoices: (companyId: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DB_KEY = 'nfe_manager_db_v4'; // Incrementado para incluir lastNSU

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem(DB_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migração: Garante que empresas antigas tenham o campo lastNSU
      return parsed.companies.map((c: any) => ({
        ...c,
        lastNSU: c.lastNSU || '0'
      }));
    }
    return MOCK_COMPANIES;
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem(DB_KEY);
    return saved ? JSON.parse(saved).invoices : MOCK_INVOICES;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dbData = {
      companies,
      invoices,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(DB_KEY, JSON.stringify(dbData));
  }, [companies, invoices]);

  const addCompany = (company: Company) => {
    // Garante que nova empresa comece com NSU 0
    setCompanies(prev => [...prev, { ...company, lastNSU: '0' }]);
  };

  const updateCompany = (updatedCompany: Company) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
  };

  const removeCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
    setInvoices(prev => prev.filter(inv => inv.companyId !== id));
  };

  const markAsDownloaded = (ids: string[]) => {
    setInvoices(prev => prev.map(inv => 
      ids.includes(inv.id) ? { ...inv, downloaded: true } : inv
    ));
  };

  // Implementação da Lógica SEFAZ (NT 2014.002)
  const searchInvoices = async (companyId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const company = companies.find(c => c.id === companyId);
      if (!company) throw new Error("Empresa não encontrada");

      // 1. Gera o XML conforme especificação técnica
      const xmlBody = buildDistDFeInt(company.cnpj, company.lastNSU);

      console.log('Enviando XML para API:', xmlBody);

      // 2. Envia para o Backend (que fará a conexão SSL Mutual com a SEFAZ)
      // Nota: Substitua a URL abaixo pelo seu endpoint real em produção
      const response = await fetch('http://localhost:3000/api/nfe/dist-dfe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml', // Ou application/json se você encapsular o XML
          'Authorization': `Bearer ${localStorage.getItem('nfe_manager_auth_token') || ''}`
        },
        body: JSON.stringify({
           xml: xmlBody,
           certificateId: company.id // Backend usa isso para pegar o .pfx correto
        })
      });

      if (!response.ok) {
        // Simulação de erro de rede ou backend offline
        throw new Error(`Erro de comunicação (HTTP ${response.status})`);
      }

      const data = await response.json();
      
      // 3. Tratamento dos Códigos de Retorno (cStat)
      // 138: Documento localizado
      // 137: Nenhum documento localizado
      if (data.cStat === '138' && data.docs) {
         const newInvoices: Invoice[] = data.docs.map((doc: any) => ({
             // Mapeamento do retorno do backend para o tipo Invoice
             id: doc.chave,
             companyId: companyId,
             accessKey: doc.chave,
             nsu: doc.nsu,
             numero: doc.numero,
             serie: doc.serie,
             emitenteName: doc.nomeEmitente,
             emitenteCNPJ: doc.cnpjEmitente,
             emissionDate: doc.dataEmissao,
             amount: parseFloat(doc.valorTotal),
             status: 'authorized',
             downloaded: false
         }));

         // Atualiza o lastNSU da empresa com o maior NSU encontrado neste lote
         const maxNSU = newInvoices.reduce((max, inv) => {
            const current = parseInt(inv.nsu);
            return current > max ? current : max;
         }, parseInt(company.lastNSU));

         updateCompany({ ...company, lastNSU: maxNSU.toString() });

         // Salva as notas
         setInvoices(prev => {
            const existingIds = new Set(prev.map(i => i.accessKey));
            const uniqueNew = newInvoices.filter(i => !existingIds.has(i.accessKey));
            return [...uniqueNew, ...prev];
         });

      } else if (data.cStat === '137') {
         // Nenhum documento novo, apenas informa
         console.info('Nenhum documento novo localizado (cStat 137).');
         // Opcional: Avisar usuário visualmente
      } else {
         // Outros erros (632, etc)
         throw new Error(`Erro SEFAZ: ${data.xMotivo} (cStat: ${data.cStat})`);
      }

    } catch (err: any) {
      console.error("Falha na busca:", err);
      setError("Não foi possível buscar na SEFAZ. Verifique se o Backend está configurado e rodando.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppContext.Provider value={{ 
      companies, 
      invoices, 
      addCompany, 
      updateCompany, 
      removeCompany, 
      markAsDownloaded, 
      searchInvoices, 
      isLoading,
      error
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
