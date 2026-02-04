import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Download, RefreshCw, FileCheck, Search, Filter, Copy, Check, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency, formatDate, formatAccessKey } from '../utils';
// @ts-ignore
import JSZip from 'jszip';
// @ts-ignore
import { saveAs } from 'file-saver';
import { Invoice } from '../types';

// Helper para reconstruir um XML válido (Simulação baseada nos dados disponíveis)
const generateXMLContent = (inv: Invoice): string => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    <NFe>
        <infNFe Id="NFe${inv.accessKey}" versao="4.00">
            <ide>
                <cUF>${inv.uf === 'BA' ? '29' : inv.uf === 'MG' ? '31' : '35'}</cUF>
                <cNF>${inv.accessKey.substring(35, 43)}</cNF>
                <natOp>${inv.operationType || 'COMPRA PARA COMERCIALIZACAO'}</natOp>
                <mod>55</mod>
                <serie>${inv.serie}</serie>
                <nNF>${inv.numero}</nNF>
                <dhEmi>${inv.emissionDate}</dhEmi>
                <tpNF>${inv.operationType === 'Entrada' ? '0' : '1'}</tpNF>
                <idDest>1</idDest>
                <cMunFG>2927408</cMunFG>
                <tpImp>1</tpImp>
                <tpEmis>1</tpEmis>
                <cDV>${inv.accessKey.slice(-1)}</cDV>
                <tpAmb>1</tpAmb>
                <finNFe>1</finNFe>
                <indFinal>0</indFinal>
                <indPres>9</indPres>
                <procEmi>0</procEmi>
                <verProc>NFe Manager Pro 1.0</verProc>
            </ide>
            <emit>
                <CNPJ>${inv.emitenteCNPJ.replace(/\D/g, '')}</CNPJ>
                <xNome>${inv.emitenteName}</xNome>
                <enderEmit>
                    <xLgr>RUA DA FABRICA</xLgr>
                    <nro>1000</nro>
                    <xBairro>CENTRO</xBairro>
                    <cMun>2927408</cMun>
                    <xMun>SALVADOR</xMun>
                    <UF>${inv.uf || 'BA'}</UF>
                    <CEP>40000000</CEP>
                    <cPais>1058</cPais>
                    <xPais>BRASIL</xPais>
                </enderEmit>
                <IE>123456789</IE>
                <CRT>3</CRT>
            </emit>
            <total>
                <ICMSTot>
                    <vBC>0.00</vBC>
                    <vICMS>0.00</vICMS>
                    <vProd>${inv.amount.toFixed(2)}</vProd>
                    <vNF>${inv.amount.toFixed(2)}</vNF>
                </ICMSTot>
            </total>
        </infNFe>
    </NFe>
    <protNFe versao="4.00">
        <infProt>
            <tpAmb>1</tpAmb>
            <verAplic>SVRS202401181014</verAplic>
            <chNFe>${inv.accessKey}</chNFe>
            <dhRecbto>${inv.authorizationDate || inv.emissionDate}</dhRecbto>
            <nProt>1${inv.accessKey.substring(0, 14)}</nProt>
            <digVal>SImuladoHashBase64==</digVal>
            <cStat>100</cStat>
            <xMotivo>Autorizado o uso da NF-e</xMotivo>
        </infProt>
    </protNFe>
</nfeProc>`;
};

export const InvoiceList: React.FC = () => {
  const { companies, invoices, isLoading, searchInvoices, markAsDownloaded, logs } = useAppContext();
  
  const [selectedCompany, setSelectedCompany] = useState<string>(companies[0]?.id || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

  // Filter invoices based on selection
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchCompany = inv.companyId === selectedCompany;
      const invDate = new Date(inv.emissionDate);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      
      const matchStart = start ? invDate >= start : true;
      const matchEnd = end ? invDate <= end : true;
      
      return matchCompany && matchStart && matchEnd;
    });
  }, [invoices, selectedCompany, startDate, endDate]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowTerminal(true);
    searchInvoices(selectedCompany);
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map(inv => inv.id)));
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

  const handleDownload = async () => {
    if (selectedInvoices.size === 0) return;
    setIsProcessing(true);
    
    try {
        const invoicesToDownload = invoices.filter(inv => selectedInvoices.has(inv.id));
        
        // Single File Download
        if (invoicesToDownload.length === 1) {
            const inv = invoicesToDownload[0];
            const xmlContent = generateXMLContent(inv);
            const blob = new Blob([xmlContent], { type: "text/xml;charset=utf-8" });
            saveAs(blob, `${inv.accessKey}-procNfe.xml`);
        } 
        // Multiple Files (Zip)
        else {
            const zip = new JSZip();
            const folder = zip.folder("notas_fiscais");
            
            invoicesToDownload.forEach(inv => {
                const xmlContent = generateXMLContent(inv);
                folder.file(`${inv.accessKey}-procNfe.xml`, xmlContent);
            });
            
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `lote_notas_${new Date().toISOString().slice(0,10)}.zip`);
        }

        markAsDownloaded(Array.from(selectedInvoices));
        setSelectedInvoices(new Set());
    } catch (error) {
        console.error("Erro ao gerar download:", error);
        alert("Erro ao processar o download dos arquivos.");
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
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Consulta de Notas</h2>
          <p className="text-gray-500">Visualize e baixe XMLs de entrada (Ambiente Nacional).</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="col-span-1 md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Empresa</label>
            <div className="relative">
              <select
                className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
              >
                <option value="" disabled>Selecione...</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.apelido}</option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 text-gray-400 w-4 h-4 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data Inicial</label>
            <div className="relative">
              <input
                type="date"
                className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data Final</label>
            <div className="relative">
              <input
                type="date"
                className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
              disabled={isLoading || !selectedCompany}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Processando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" /> Consultar Sefaz
                </>
              )}
            </button>
          </div>
        </form>
      </div>

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

      <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{filteredInvoices.length}</span> documentos listados
        </div>
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
          {isProcessing ? 'Gerando Arquivos...' : selectedInvoices.size > 1 ? `Baixar .ZIP (${selectedInvoices.size})` : 'Baixar XML'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-4">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    checked={filteredInvoices.length > 0 && selectedInvoices.size === filteredInvoices.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3">Número NF-e</th>
                <th className="px-4 py-3">CNPJ Emitente</th>
                <th className="px-4 py-3">Razão Social Emitente</th>
                <th className="px-4 py-3">Data de Emissão</th>
                <th className="px-4 py-3">Data de Autorização</th>
                <th className="px-4 py-3 text-right">Valor (R$)</th>
                <th className="px-4 py-3">Chave de Acesso</th>
                <th className="px-4 py-3">UF</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-400">
                    Nenhuma nota fiscal encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className={`hover:bg-blue-50/50 transition-colors ${selectedInvoices.has(inv.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        checked={selectedInvoices.has(inv.id)}
                        onChange={() => toggleInvoice(inv.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.numero}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.emitenteCNPJ}</td>
                    <td className="px-4 py-3 text-gray-800 truncate max-w-[200px]" title={inv.emitenteName}>
                      {inv.emitenteName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(inv.emissionDate)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(inv.authorizationDate)}</td>
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
                         <span>{inv.accessKey.substring(0, 25)}...</span>
                         {copiedKey === inv.accessKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{inv.uf || 'BA'}</td>
                    <td className="px-4 py-3">
                       <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        inv.status === 'authorized' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                       }`}>
                         {inv.status === 'authorized' ? 'Autorizada' : 'Cancelada'}
                       </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{inv.operationType || 'Saida'}</td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => {
                          setSelectedInvoices(new Set([inv.id]));
                          handleDownload();
                        }}
                        className={`p-1.5 rounded-full transition-colors ${
                          inv.downloaded ? 'text-green-600 hover:bg-green-100' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-100'
                        }`}
                        title={inv.downloaded ? "Baixado" : "Baixar XML"}
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
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex justify-between">
            <span>Última sincronização: {new Date().toLocaleTimeString()}</span>
            <span>Ambiente Nacional - SEFAZ</span>
        </div>
      </div>
    </div>
  );
};