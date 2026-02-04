import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (user: string, pass: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('nfe_manager_auth') === 'true';
  });

  const login = (userInput: string, passInput: string) => {
    // Vite substitui import.meta.env estaticamente. O uso de casting (as any) quebra essa substituição.
    // Acessamos diretamente. O arquivo vite-env.d.ts resolve o erro de tipagem do TypeScript.
    const validUser = import.meta.env.VITE_USER || 'user';
    const validPass = import.meta.env.VITE_PASSWORD || 'password';

    if (userInput === validUser && passInput === validPass) {
      setIsAuthenticated(true);
      localStorage.setItem('nfe_manager_auth', 'true');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('nfe_manager_auth');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};