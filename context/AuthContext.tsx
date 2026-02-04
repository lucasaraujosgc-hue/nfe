import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

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

  const login = (user: string, pass: string) => {
    // In a real app, these would come strictly from process.env
    // Defaulting to user/password for immediate testing
    const validUser = process.env.REACT_APP_USER || 'user';
    const validPass = process.env.REACT_APP_PASS || 'password';

    if (user === validUser && pass === validPass) {
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