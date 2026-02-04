import React, { useState } from 'react';
import { Upload, Building2, CheckCircle, AlertCircle, ShieldCheck, Edit2, Trash2, Plus, X, Save, Lock, Loader2 } from 'lucide-react';
import { formatCNPJ } from '../utils';
import { useAppContext } from '../context/AppContext';
import { Company } from '../types';

export const CompanyRegistration: React.FC = () => {
  const { addCompany, updateCompany, removeCompany, companies, verifyCertificate } = useAppContext();
  
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    cnpj: '',
    razaoSocial: '',
    apelido: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  
  // Feedback States
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleNew = () => {
    setFormData({ cnpj: '', razaoSocial: '', apelido: '' });
    setFile(null);
    setPassword('');
    setEditingId(null);
    setViewMode('form');
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleEdit = (company: Company) => {
    setFormData({
      cnpj: company.cnpj,
      razaoSocial: company.razaoSocial,
      apelido: company.apelido,
    });
    setFile(null); 
    setPassword(company.certificatePassword || ''); 
    setEditingId(company.id);
    setViewMode('form');
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir a empresa ${name}? Todas as configurações serão perdidas.`)) {
      removeCompany(id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');
    setIsVerifying(true);

    try {
        if (editingId) {
            const existingCompany = companies.find(c => c.id === editingId);
            if (!existingCompany) {
                setIsVerifying(false);
                return;
            }

            // Se usuário trocou arquivo ou senha, precisamos validar
            if (file || (password && password !== existingCompany.certificatePassword)) {
                 await verifyCertificate(file, password || existingCompany.certificatePassword || '');
            }

            const updatedCompany: Company = {
                ...existingCompany,
                cnpj: formData.cnpj,
                razaoSocial: formData.razaoSocial,
                apelido: formData.apelido,
                certificateName: file ? file.name : existingCompany.certificateName,
                certificateExpiry: file ? '2026-01-01' : existingCompany.certificateExpiry,
                certificatePassword: password || existingCompany.certificatePassword, 
                lastNSU: existingCompany.lastNSU
            };
            updateCompany(updatedCompany);
            setSuccessMsg('Empresa atualizada com sucesso!');
        } else {
            if (!file) {
                alert("Certificado digital é obrigatório para cadastro.");
                setIsVerifying(false);
                return;
            }
            if (!password) {
                alert("A senha do certificado é obrigatória.");
                setIsVerifying(false);
                return;
            }

            // Validação no Backend
            await verifyCertificate(file, password);

            const newCompany: Company = {
                id: Date.now().toString(),
                cnpj: formData.cnpj,
                razaoSocial: formData.razaoSocial,
                apelido: formData.apelido,
                certificateName: file.name,
                certificateExpiry: '2025-12-31', 
                certificatePassword: password, 
                lastNSU: '0'
            };
            addCompany(newCompany);
            setSuccessMsg('Empresa cadastrada com sucesso!');
        }

        setTimeout(() => {
            setSuccessMsg('');
            setViewMode('list');
        }, 1500);

    } catch (error: any) {
        setErrorMsg(error.message || "Erro desconhecido ao validar certificado.");
    } finally {
        setIsVerifying(false);
    }
  };

  if (viewMode === 'list') {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gerenciar Empresas</h2>
            <p className="text-gray-500">Administre os cadastros e certificados digitais.</p>
          </div>
          <button 
            onClick={handleNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" /> Nova Empresa
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.map((company) => (
            <div key={company.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Ativo
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 mb-1">{company.apelido}</h3>
                <p className="text-sm text-gray-600 mb-4">{company.razaoSocial}</p>
                
                <div className="space-y-2 mb-6">
                   <div className="text-sm">
                     <span className="text-gray-500 block text-xs uppercase font-semibold">CNPJ</span>
                     <span className="font-mono text-gray-800">{company.cnpj}</span>
                   </div>
                   <div className="text-sm">
                     <span className="text-gray-500 block text-xs uppercase font-semibold">Certificado</span>
                     <div className="flex items-center gap-1 text-blue-600">
                        <ShieldCheck className="w-3 h-3" />
                        <span className="truncate w-40">{company.certificateName || 'Não configurado'}</span>
                     </div>
                   </div>
                   <div className="text-sm">
                     <span className="text-gray-500 block text-xs uppercase font-semibold">Último NSU</span>
                     <span className="font-mono text-gray-800">{company.lastNSU}</span>
                   </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button 
                    onClick={() => handleEdit(company)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 border border-gray-200 text-sm font-medium transition-colors"
                >
                    <Edit2 className="w-4 h-4" /> Editar
                </button>
                <button 
                    onClick={() => handleDelete(company.id, company.apelido)}
                    className="flex items-center justify-center px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-100 transition-colors"
                    title="Excluir Empresa"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {companies.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
              <Building2 className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-lg font-medium text-gray-500">Nenhuma empresa cadastrada</p>
              <p className="text-sm">Clique em "Nova Empresa" para começar.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">
                    {editingId ? 'Editar Empresa' : 'Cadastrar Empresa'}
                </h2>
                <p className="text-gray-500">Preencha os dados fiscais e anexe o certificado.</p>
            </div>
            <button 
                onClick={() => setViewMode('list')}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            >
                <X className="w-6 h-6 text-gray-500" />
            </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {successMsg && (
              <div className="p-4 bg-green-50 text-green-700 flex items-center justify-center gap-2 border-b border-green-100 animate-in fade-in slide-in-from-top-1">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-4 bg-red-50 text-red-700 flex items-center justify-center gap-2 border-b border-red-100 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ</label>
                        <input
                            type="text"
                            required
                            placeholder="00.000.000/0000-00"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={formData.cnpj}
                            onChange={(e) => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Apelido</label>
                        <input
                            type="text"
                            required
                            placeholder="Ex: Filial SP"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={formData.apelido}
                            onChange={(e) => setFormData({ ...formData, apelido: e.target.value })}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Razão Social</label>
                    <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        value={formData.razaoSocial}
                        onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                    />
                </div>

                <div className="border-t border-gray-100 pt-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        Certificado Digital (A1)
                    </h4>
                    
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        {editingId && !file && (
                            <div className="mb-4 text-sm text-gray-600 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span>Certificado atual: <strong>{companies.find(c => c.id === editingId)?.certificateName}</strong></span>
                            </div>
                        )}
                        
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {editingId ? 'Trocar Certificado (Opcional)' : 'Arquivo .PFX ou .P12'}
                        </label>
                        <input 
                            type="file" 
                            accept=".pfx,.p12"
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors"
                            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                        />
                    </div>
                </div>

                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
                        <span>Senha do Certificado</span>
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">Teste: Use "123456"</span>
                    </label>
                    <div className="relative">
                        <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                        <input
                            type="password"
                            required={!editingId} 
                            placeholder="Senha do arquivo .pfx"
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        A senha é necessária para que o backend decifre a chave privada e assine as requisições SOAP.
                    </p>
                </div>

                <div className="pt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        disabled={isVerifying}
                        className="flex-1 px-4 py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isVerifying}
                        className={`flex-[2] flex items-center justify-center gap-2 text-white font-medium py-3 rounded-lg transition-colors shadow-md ${
                            isVerifying ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Verificando...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                {editingId ? 'Salvar Alterações' : 'Cadastrar Empresa'}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};