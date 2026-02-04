import React, { useState } from 'react';
import { Upload, Building2, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { formatCNPJ } from '../utils';
import { useAppContext } from '../context/AppContext';
import { Company } from '../types';

export const CompanyRegistration: React.FC = () => {
  const { addCompany, companies } = useAppContext();
  const [formData, setFormData] = useState({
    cnpj: '',
    razaoSocial: '',
    apelido: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const newCompany: Company = {
      id: Date.now().toString(),
      cnpj: formData.cnpj,
      razaoSocial: formData.razaoSocial,
      apelido: formData.apelido,
      certificateName: file.name,
      certificateExpiry: '2025-12-31', // Mock expiry
    };

    addCompany(newCompany);
    setSuccess(true);
    setTimeout(() => {
        setSuccess(false);
        setFormData({ cnpj: '', razaoSocial: '', apelido: '' });
        setFile(null);
        setPassword('');
    }, 3000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gerenciar Empresas</h2>
          <p className="text-gray-500">Cadastre o certificado digital (.pfx) para consulta automática.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Registration Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Nova Empresa
            </h3>
            
            {success && (
              <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2 border border-green-200">
                <CheckCircle className="w-5 h-5" />
                <span>Empresa cadastrada com sucesso!</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input
                    type="text"
                    required
                    placeholder="00.000.000/0000-00"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Apelido (Identificação Interna)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Matriz"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    value={formData.apelido}
                    onChange={(e) => setFormData({ ...formData, apelido: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
                <input
                  type="text"
                  required
                  placeholder="Nome completo da empresa"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={formData.razaoSocial}
                  onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                />
              </div>

              <div className="border-t border-gray-100 my-4 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Certificado Digital (.pfx)</label>
                <div className="flex items-center justify-center w-full">
                  <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:bg-gray-50'}`}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className={`w-8 h-8 mb-3 ${file ? 'text-green-500' : 'text-gray-400'}`} />
                      <p className="mb-2 text-sm text-gray-500">
                        {file ? <span className="font-semibold text-green-700">{file.name}</span> : <><span className="font-semibold">Clique para enviar</span> ou arraste</>}
                      </p>
                      <p className="text-xs text-gray-500">Apenas arquivos .PFX ou .P12</p>
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".pfx,.p12"
                      onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha do Certificado</label>
                <input
                  type="password"
                  required={!!file}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!file}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cadastrar Empresa
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Existing Companies List */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Empresas Ativas</h3>
            <div className="space-y-4">
              {companies.map((company) => (
                <div key={company.id} className="p-4 rounded-lg border border-gray-100 hover:border-blue-200 bg-gray-50 hover:bg-blue-50 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-gray-900">{company.apelido}</h4>
                      <p className="text-xs text-gray-500 mt-1">{company.razaoSocial}</p>
                      <p className="text-xs font-mono text-gray-600 mt-1">{company.cnpj}</p>
                    </div>
                    <div className="bg-green-100 p-1.5 rounded-full">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                    </div>
                  </div>
                  {company.certificateName && (
                     <div className="mt-3 flex items-center gap-2 text-xs text-blue-600 bg-blue-100/50 px-2 py-1 rounded">
                       <ShieldCheck className="w-3 h-3" />
                       <span className="truncate max-w-[150px]">{company.certificateName}</span>
                     </div>
                  )}
                </div>
              ))}
              
              {companies.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma empresa cadastrada.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};