import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { CompanyRegistration } from './pages/CompanyRegistration';
import { InvoiceList } from './pages/InvoiceList';
import { Login } from './pages/Login';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        {children}
      </main>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Navigate to="/invoices" replace />
              </ProtectedRoute>
            } />
            <Route path="/companies" element={
              <ProtectedRoute>
                <CompanyRegistration />
              </ProtectedRoute>
            } />
            <Route path="/invoices" element={
              <ProtectedRoute>
                <InvoiceList />
              </ProtectedRoute>
            } />
          </Routes>
        </HashRouter>
      </AppProvider>
    </AuthProvider>
  );
};

export default App;