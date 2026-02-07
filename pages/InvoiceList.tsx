import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Download, RefreshCw, FileCheck, Search, Filter, Copy, Check, Terminal, ChevronDown, ChevronUp, DownloadCloud, ArrowUpDown, ArrowUp, ArrowDown, FileText, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency, formatDate, formatAccessKey } from '../utils';
// @ts-ignore
import JSZip from 'jszip';
// @ts-ignore
import { saveAs } from 'file-saver';
import { Invoice } from '../types';

export const InvoiceList: React.FC = () => {
  // Adicionado isError para feedback visual
  const { companies, invoices, isLoading, isError, searchInvoices, fetchFullXml, manifestInvoice, markAsDownloaded, logs } = useAppContext();
  
  const [selectedCompany, setSelectedCompany] = useState<string>(companies[0]?.id || '');
  
  // --- LOCAL FILTERS STATE ---
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Column Filters
  const [filters, setFilters] = useState({
      numero: '',
      emitenteName: '',
      emitenteCNPJ: '',
      accessKey: '',
      amount: '',
  });

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: keyof Invoice | '', direction: 'asc' | 'desc' }>({ key: 'emissionDate', direction: 'desc' });

  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current && showTerminal) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showTerminal]);

  // Handle Sort Click
  const handleSort = (key: keyof Invoice) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  // Handle Column Filter Change
  const handleFilterChange = (key: string, value: string) => {
      setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Filter & Sort Logic
  const processedInvoices = useMemo(() => {
    let result = invoices.filter(inv => {
      const matchCompany = inv.companyId === selectedCompany;
      
      // Date Filter
      const invDate = new Date(inv.emissionDate);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      // Ajuste para fim do dia
      if (end) end.setHours(23, 59, 59, 999);

      const matchStart = start ? invDate >= start : true;
      const matchEnd = end ? invDate <= end : true;
      
      // Column Filters
      const matchNumber = inv.numero?.toLowerCase().includes(filters.numero.toLowerCase()) ?? true;
      const matchName = inv.emitenteName?.toLowerCase().includes(filters.emitenteName.toLowerCase()) ?? true;
      const matchCNPJ = inv.emitenteCNPJ?.includes(filters.emitenteCNPJ) ?? true;
      const matchKey = inv.accessKey?.includes(filters.accessKey) ?? true;
      const matchAmount = filters.amount ? inv.amount.toString().includes(filters.amount) : true;

      return matchCompany && matchStart && matchEnd && matchNumber && matchName && matchCNPJ && matchKey && matchAmount;
    });

    // Sorting
    if (sortConfig.key) {
        result.sort((a, b) => {
            const aValue = a[sortConfig.key] ?? '';
            const bValue = b[sortConfig.key] ?? '';
            
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return result;
  }, [invoices, selectedCompany, startDate, endDate, filters, sortConfig]);

  // Count summaries for the button
  const summaryCount = useMemo(() => {
      return processedInvoices.filter(inv => inv.originalXml?.includes('resNFe')).length;
  }, [processedInvoices]);

  const handleSyncSefaz = () => {
    setShowTerminal(true);
    searchInvoices(selectedCompany);
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === processedInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(processedInvoices.map(inv => inv.id)));
    }
  };

  const toggleInvoice = (id: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInvoices(newSelected);
  };

  // --- NOVA LÓGICA DE DOWNLOAD FORÇADO ---
  const handleForceFullDownload = async (targetInvoices: Invoice[]) => {
      setShowTerminal(true);
      setIsProcessing(true);

      for (const inv of targetInvoices) {
          // 1. Tentar baixar
          const success = await fetchFullXml(inv.companyId, inv.accessKey);
          
          if (!success) {
              // 2. Se falhar, perguntar se quer manifestar
              const confirmManifest = window.confirm(
                  `O XML completo da nota ${inv.numero || 'S/N'} (Final da chave: ...${inv.accessKey.slice(-4)}) não foi encontrado.\n\n` +
                  `Deseja realizar a "Ciência da Operação" agora para tentar liberar o download?`
              );

              if (confirmManifest) {
                  const manifestSuccess = await manifestInvoice(inv.companyId, inv.accessKey);
                  if (manifestSuccess) {
                      // 3. Aguardar 1.5s para processamento da SEFAZ
                      await new Promise(r => setTimeout(r, 1500));
                      // 4. Tentar baixar novamente
                      await fetchFullXml(inv.companyId, inv.accessKey);
                  }
              }
          }
      }
      setIsProcessing(false);
  };

  const handleBatchForceDownload = async () => {
      // Prioriza a seleção, senão pega todos os resumos visíveis
      let targets: Invoice[] = [];
      
      if (selectedInvoices.size > 0) {
          targets = invoices.filter(inv => selectedInvoices.has(inv.id) && inv.originalXml?.includes('resNFe'));
      } else {
          targets = processedInvoices.filter(inv => inv.originalXml?.includes('resNFe'));
      }

      if (targets.length === 0) {
          alert("Nenhuma nota de 'Resumo' encontrada na seleção ou na lista atual.");
          return;
      }

      if (window.confirm(`Você está prestes a tentar obter o XML COMPLETO de ${targets.length} notas.\n\nCaso a nota não esteja disponível, será solicitado confirmação para realizar a Manifestação (Ciência). Continuar?`)) {
          await handleForceFullDownload(targets);
      }
  };

  const handleDownload = async () => {
    if (selectedInvoices.size === 0) return;
    setIsProcessing(true);
    
    try {
        const invoicesToDownload = invoices.filter(inv => selectedInvoices.has(inv.id));
        
        if (invoicesToDownload.length === 1) {
            const inv = invoicesToDownload[0];
            const xmlContent = inv.originalXml || "";
            const suffix = xmlContent.includes('resNFe') ? '-resumo.xml' : '-procNFe.xml';
            const blob = new Blob([xmlContent], { type: "text/xml;charset=utf-8" });
            saveAs(blob, `${inv.accessKey}${suffix}`);
        } else {
            const zip = new JSZip();
            const folder = zip.folder("notas_fiscais");
            invoicesToDownload.forEach(inv => {
                const xmlContent = inv.originalXml || "";
                const suffix = xmlContent.includes('resNFe') ? '-resumo.xml' : '-procNFe.xml';
                folder.file(`${inv.accessKey}${suffix}`, xmlContent);
            });
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `lote_notas_${new Date().toISOString().slice(0,10)}.zip`);
        }
        markAsDownloaded(Array.from(selectedInvoices));
        setSelectedInvoices(new Set());
    } catch (error) {
        console.error("Erro ao gerar download:", error);
    } finally {
        setIsProcessing(false);
    }
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatDateTime = (isoString: string | undefined) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' });
  };

  // Helper para o ícone de sort
  const SortIcon = ({ colKey }: { colKey: keyof Invoice }) => {
      if (sortConfig.key !== colKey) return <ArrowUpDown className="w-3 h-3 text-gray-300 ml-1 inline" />;
      return sortConfig.direction === 'asc' 
        ? <ArrowUp className="w-3 h-3 text-blue-600 ml-1 inline" /> 
        : <ArrowDown className="w-3 h-3 text-blue-600 ml-1 inline" />;
  };

  // TELA DE ERRO DE CONEXÃO
  if (isError) {
      return (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-red-100 p-6 rounded-full mb-6">
                  <AlertTriangle className="w-16 h-16 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Serviço Indisponível</h2>
              <p className="text-gray-600 max-w-lg mb-6">
                  Não foi possível conectar ao servidor Backend. Isso geralmente acontece quando o serviço .NET não está rodando.
              </p>
              <div className="bg-gray-100 p-4 rounded-lg text-left max-w-lg w-full font-mono text-xs text-gray-700 border border-gray-300 shadow-inner">
                 <p className="font-bold mb-2">// Dicas de Solução:</p>
                 <p>1. Verifique se o comando 'dotnet run' está rodando no terminal.</p>
                 <p>2. Certifique-se de que o backend está na porta 5000.</p>
                 <p>3. Verifique se não há erros de compilação no console.</p>
              </div>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-8 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                Tentar Conectar Novamente
              </button>
          </div>
      );
  }

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER: Título e Botão de Sync SEFAZ Separado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
             <div className="flex flex-col">
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1">Empresa Selecionada</label>
                <div className="relative w-64">
                    <select
                        className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg appearance-none bg-gray-50 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        value={selectedCompany}
                        onChange={(e) => setSelectedCompany(e.target.value)}
                    >
                        {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.apelido}</option>
                        ))}
                    </select>
                    <Filter className="absolute right-3 top-2.5 text-gray-400 w-4 h-4 pointer-events-none" />
                </div>
             </div>
        </div>

        <button 
            onClick={handleSyncSefaz} 
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm hover:shadow"
            disabled={isLoading || !selectedCompany}
        >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>Sincronizar com SEFAZ</span>
        </button>
      </div>

      {/* ÁREA DE FILTROS LOCAIS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mr-2">
              <Search className="w-4 h-4" />
              Filtros Locais:
          </div>
          
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">De</label>
            <input
                type="date"
                className="pl-2 pr-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Até</label>
            <input
                type="date"
                className="pl-2 pr-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
      </div>

      <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{processedInvoices.length}</span> documentos listados
        </div>

        <div className="flex gap-2">
            {/* BOTÃO COMPLETO FORÇADO */}
            {summaryCount > 0 && (
                <button
                    onClick={handleBatchForceDownload}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-all border border-blue-200 shadow-sm"
                    title="Tentar baixar XML Completo para todas os Resumos. Se necessário, perguntará para Manifestar."
                >
                     {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                     <span>Obter XMLs Completos ({summaryCount})</span>
                </button>
            )}

            <button
            onClick={handleDownload}
            disabled={selectedInvoices.size === 0 || isProcessing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                selectedInvoices.size > 0 
                ? 'bg-green-600 text-white hover:bg-green-700 shadow-md transform hover:-translate-y-0.5' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
            >
            {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isProcessing ? 'Gerando...' : selectedInvoices.size > 1 ? `Salvar Selecionados (${selectedInvoices.size})` : 'Salvar XML'}
            </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
              {/* HEADER ROW WITH SORT */}
              <tr>
                <th className="px-4 py-3 w-4">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    checked={processedInvoices.length > 0 && selectedInvoices.size === processedInvoices.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('numero')}>Número <SortIcon colKey="numero"/></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('emitenteCNPJ')}>CNPJ <SortIcon colKey="emitenteCNPJ"/></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('emitenteName')}>Razão Social <SortIcon colKey="emitenteName"/></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('emissionDate')}>Emissão <SortIcon colKey="emissionDate"/></th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-200" onClick={() => handleSort('amount')}>Valor (R$) <SortIcon colKey="amount"/></th>
                <th className="px-4 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('accessKey')}>Chave de Acesso <SortIcon colKey="accessKey"/></th>
                <th className="px-4 py-3">Tipo XML</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
              {/* FILTER ROW */}
              <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2"><input placeholder="Filtro..." className="w-full p-1 border rounded text-xs font-normal" value={filters.numero} onChange={e => handleFilterChange('numero', e.target.value)} /></th>
                  <th className="px-4 py-2"><input placeholder="Filtro..." className="w-full p-1 border rounded text-xs font-normal" value={filters.emitenteCNPJ} onChange={e => handleFilterChange('emitenteCNPJ', e.target.value)} /></th>
                  <th className="px-4 py-2"><input placeholder="Filtro..." className="w-full p-1 border rounded text-xs font-normal" value={filters.emitenteName} onChange={e => handleFilterChange('emitenteName', e.target.value)} /></th>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2"><input placeholder="Filtro..." className="w-full p-1 border rounded text-xs font-normal text-right" value={filters.amount} onChange={e => handleFilterChange('amount', e.target.value)} /></th>
                  <th className="px-4 py-2"><input placeholder="Filtro..." className="w-full p-1 border rounded text-xs font-normal" value={filters.accessKey} onChange={e => handleFilterChange('accessKey', e.target.value)} /></th>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {processedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-400">
                    Nenhuma nota fiscal encontrada.
                  </td>
                </tr>
              ) : (
                processedInvoices.map((inv) => (
                  <tr key={inv.id} className={`hover:bg-blue-50/50 transition-colors ${selectedInvoices.has(inv.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        checked={selectedInvoices.has(inv.id)}
                        onChange={() => toggleInvoice(inv.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.numero !== '000' ? inv.numero : '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.emitenteCNPJ}</td>
                    <td className="px-4 py-3 text-gray-800 truncate max-w-[200px]" title={inv.emitenteName}>
                      {inv.emitenteName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(inv.emissionDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div 
                        className={`font-mono text-[10px] p-1 rounded w-max cursor-pointer transition-all flex items-center gap-1 group ${
                          copiedKey === inv.accessKey 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-700'
                        }`}
                        onClick={() => copyToClipboard(inv.accessKey)}
                        title={inv.accessKey}
                      >
                         <span>{inv.accessKey.substring(0, 20)}...</span>
                         {copiedKey === inv.accessKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                        {inv.originalXml?.includes('resNFe') ? (
                           <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full border border-yellow-200">Resumo</span>
                        ) : (
                           <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full border border-green-200">Completa</span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-center flex items-center justify-center gap-2">
                      {/* Botão Baixar XML Completo (Só se for resumo) */}
                      {inv.originalXml?.includes('resNFe') && (
                          <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleForceFullDownload([inv]);
                            }}
                            className="p-1.5 rounded-full text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Tentar baixar XML Completo (Manifestando se necessário)"
                            disabled={isLoading}
                          >
                             <DownloadCloud className="w-4 h-4" />
                          </button>
                      )}

                      <button 
                        onClick={() => {
                          setSelectedInvoices(new Set([inv.id]));
                          handleDownload();
                        }}
                        className={`p-1.5 rounded-full transition-colors ${
                          inv.downloaded ? 'text-green-600 hover:bg-green-100' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-100'
                        }`}
                        title={inv.downloaded ? "Salvar Arquivo" : "Salvar XML"}
                      >
                        {inv.downloaded ? <FileCheck className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* LOG TERMINAL (Fixed Bottom) */}
      <div className={`fixed bottom-0 left-64 right-0 bg-[#1e1e1e] text-gray-300 shadow-2xl transition-all duration-300 z-30 border-t border-gray-700 ${showTerminal ? 'h-64' : 'h-10'}`}>
         <div 
            className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] cursor-pointer hover:bg-[#3d3d3d] transition-colors"
            onClick={() => setShowTerminal(!showTerminal)}
         >
            <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-green-500" />
                <span className="text-xs font-mono font-bold text-white">SERVIDOR BACKEND - LOGS DE EXECUÇÃO</span>
                {isLoading && <span className="text-[10px] bg-blue-600 text-white px-2 rounded-full animate-pulse">EXECUTANDO</span>}
            </div>
            {showTerminal ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
         </div>
         
         {showTerminal && (
             <div className="p-4 font-mono text-xs overflow-y-auto h-[calc(100%-40px)] space-y-2">
                 {logs.length === 0 && (
                    <div className="text-gray-500 italic">Aguardando início do processo...</div>
                 )}
                 {logs.map((log) => (
                    <div key={log.id} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                        <span className="text-gray-500 select-none">[{log.timestamp}]</span>
                        <div className="flex-1">
                            <span className={`font-bold ${
                                log.type === 'error' ? 'text-red-500' : 
                                log.type === 'success' ? 'text-green-500' : 
                                log.type === 'warning' ? 'text-yellow-500' : 'text-blue-400'
                            }`}>
                                {log.type.toUpperCase()}:
                            </span>
                            <span className="ml-2 text-gray-200">{log.message}</span>
                            {log.details && (
                                <pre className="mt-1 p-2 bg-black/30 rounded text-gray-400 border-l-2 border-gray-600 overflow-x-auto">
                                    {log.details}
                                </pre>
                            )}
                        </div>
                    </div>
                 ))}
                 <div ref={logsEndRef} />
             </div>
         )}
      </div>

    </div>
  );
};