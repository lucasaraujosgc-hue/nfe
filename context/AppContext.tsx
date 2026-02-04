import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Company, Invoice } from '../types';
import { MOCK_COMPANIES, MOCK_INVOICES } from '../constants';

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

const DB_KEY = 'nfe_manager_db_v3'; // Incrementado para garantir estrutura nova

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem(DB_KEY);
    return saved ? JSON.parse(saved).companies : MOCK_COMPANIES;
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
    setCompanies(prev => [...prev, company]);
  };

  const updateCompany = (updatedCompany: Company) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
  };

  const removeCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
    // Opcional: Remover notas fiscais associadas a essa empresa
    setInvoices(prev => prev.filter(inv => inv.companyId !== id));
  };

  const markAsDownloaded = (ids: string[]) => {
    setInvoices(prev => prev.map(inv => 
      ids.includes(inv.id) ? { ...inv, downloaded: true } : inv
    ));
  };

  // Implementação REAL de busca (Requer Backend)
  const searchInvoices = async (companyId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const company = companies.find(c => c.id === companyId);
      if (!company) throw new Error("Empresa não encontrada");

      // EM PRODUÇÃO: A URL abaixo deve apontar para o seu backend real (Node/Python/PHP)
      // O Backend deve possuir o certificado pfx decifrado para comunicar com a SEFAZ.
      const response = await fetch('http://localhost:3000/api/nfe/consultar-destinadas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}` // Exemplo de auth
        },
        body: JSON.stringify({
          cnpj: company.cnpj,
          // Nota: O certificado físico não é enviado aqui por JSON, 
          // ele deve ter sido enviado via upload prévio ou estar configurado no servidor.
        })
      });

      if (!response.ok) {
        throw new Error(`Erro na comunicação com servidor: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Assume que o backend retorna um array de notas novas
      const newInvoices: Invoice[] = data.invoices;
      
      // Mescla com as existentes evitando duplicatas
      setInvoices(prev => {
        const existingIds = new Set(prev.map(i => i.accessKey));
        const uniqueNew = newInvoices.filter(i => !existingIds.has(i.accessKey));
        return [...uniqueNew, ...prev];
      });

    } catch (err: any) {
      console.error("Falha na busca real:", err);
      setError("Não foi possível conectar ao servidor de NFe. Verifique se o Backend está rodando.");
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