import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Company, Invoice } from '../types';
import { MOCK_COMPANIES, MOCK_INVOICES } from '../constants';

interface AppContextType {
  companies: Company[];
  invoices: Invoice[];
  addCompany: (company: Company) => void;
  markAsDownloaded: (ids: string[]) => void;
  searchInvoices: (companyId: string) => void;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DB_KEY = 'nfe_manager_db_v1';

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Load initial state from LocalStorage (simulating app/data/db.json) or fall back to Mocks
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem(DB_KEY);
    return saved ? JSON.parse(saved).companies : MOCK_COMPANIES;
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem(DB_KEY);
    return saved ? JSON.parse(saved).invoices : MOCK_INVOICES;
  });

  const [isLoading, setIsLoading] = useState(false);

  // Persistence Effect: Save to "app/data" (LocalStorage) whenever data changes
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

  const markAsDownloaded = (ids: string[]) => {
    setInvoices(prev => prev.map(inv => 
      ids.includes(inv.id) ? { ...inv, downloaded: true } : inv
    ));
  };

  const searchInvoices = (companyId: string) => {
    setIsLoading(true);
    // Simulate API call delay to SEFAZ
    setTimeout(() => {
      setIsLoading(false);
      // In a real scenario, this would fetch new data and append to `invoices`
    }, 1500);
  };

  return (
    <AppContext.Provider value={{ companies, invoices, addCompany, markAsDownloaded, searchInvoices, isLoading }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};