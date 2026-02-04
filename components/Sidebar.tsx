import React from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, FileText, LayoutDashboard, ShieldCheck } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col fixed left-0 top-0 z-20">
      <div className="p-6 flex items-center gap-2 border-b border-gray-100">
        <div className="bg-blue-600 p-2 rounded-lg">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-gray-900 text-lg leading-tight">NFe Manager</h1>
          <span className="text-xs text-gray-500">Gestão de Documentos</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <NavLink to="/" className={linkClass}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="font-medium">Dashboard</span>
        </NavLink>
        <NavLink to="/companies" className={linkClass}>
          <Building2 className="w-5 h-5" />
          <span className="font-medium">Empresas</span>
        </NavLink>
        <NavLink to="/invoices" className={linkClass}>
          <FileText className="w-5 h-5" />
          <span className="font-medium">Consultar Notas</span>
        </NavLink>
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-800 font-semibold mb-1">Ambiente Nacional</p>
          <p className="text-xs text-blue-600">Serviço: NFeDistribuicaoDFe</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-xs text-gray-600">Online</span>
          </div>
        </div>
      </div>
    </aside>
  );
};