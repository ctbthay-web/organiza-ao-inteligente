
import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  CheckCircle, 
  Download, 
  ChevronRight, 
  FileSpreadsheet, 
  Loader2, 
  Zap, 
  X, 
  UploadCloud, 
  Info, 
  Settings2, 
  Eye, 
  EyeOff, 
  Database, 
  Calculator, 
  UserCheck, 
  ArrowLeft, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Filter,
  Split,
  AlertTriangle,
  Anchor,
  Wand2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

import { FileMetadata, ProcessingResult, FileType } from './types';
import { fileToBase64, parseExcel, extractPdfTextInChunks, pdfToImages } from './utils/fileUtils';
import { extractDataFromReport } from './services/geminiService';

const QUICK_ACTIONS = [
  {
    id: 'consolidate',
    title: 'Consolidar Planilhas',
    description: 'Una múltiplos arquivos em uma tabela mestre buscando Nome, CPF e Valores.',
    icon: <FileSpreadsheet className="w-8 h-8 text-green-600" />,
    instruction: 'Pegue o Relatório 1 como base. No Relatório 2, procure por Nome ou CPF e traga os valores adicionais solicitados.',
    color: 'bg-green-50'
  },
  {
    id: 'commission',
    title: 'Cálculo de Comissões',
    description: 'Identifica e aplica fórmulas (V. Geral - Folha - DSR) gerando Excel nativo.',
    icon: <Calculator className="w-8 h-8 text-indigo-600" />,
    instruction: 'Relatório 1 é a base. Calcule a COMISSAO subtraindo FOLHA e DSR do VALOR_GERAL que está no Relatório 2.',
    color: 'bg-indigo-50'
  },
  {
    id: 'compare',
    title: 'Auditoria de Cruzamento',
    description: 'Verifique se os dados do Relatório 2 batem com sua Base oficial.',
    icon: <Split className="w-8 h-8 text-red-600" />,
    instruction: 'Compare os registros. Mantenha a Base (Relatório 1) e aponte divergências de valores encontradas no Relatório 2.',
    color: 'bg-red-50'
  },
  {
    id: 'adjust',
    title: 'Ajustar Excel',
    description: 'Filtre, limpe ou reorganize colunas e informações conforme sua necessidade.',
    icon: <Wand2 className="w-8 h-8 text-amber-600" />,
    instruction: 'Analise o arquivo e ajuste conforme o seguinte critério: [DESCREVA AQUI O QUE DESEJA MANTER OU MUDAR]',
    color: 'bg-amber-50'
  }
];

const App: React.FC = () => {
  const [activeStep, setActiveStep] = useState<'start' | 'config' | 'processing' | 'result'>('start');
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [instruction, setInstruction] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0, phase: '', subPhase: '' });
  
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });

  useEffect(() => {
    if (result && result.data.length > 0) {
      setVisibleColumns(result.headers);
    }
  }, [result]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      const newFiles: FileMetadata[] = Array.from(selectedFiles).map((f: File) => {
        let detectedType: FileType = 'unknown';
        const name = f.name.toLowerCase();
        if (name.endsWith('.pdf')) detectedType = 'pdf';
        else if (name.endsWith('.xlsx') || name.endsWith('.xls')) detectedType = 'excel';
        else if (f.type.includes('image')) detectedType = 'image';
        return { name: f.name, size: f.size, type: detectedType, raw: f };
      });
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setActiveStep('processing');
    
    try {
      let allExtractedText = "";
      let imageParts: any[] = [];
      setProgress({ current: 0, total: files.length, percent: 0, phase: `Iniciando análise paralela de ${files.length} arquivo(s)...`, subPhase: '' });

      const processingTasks = files.map(async (file, idx) => {
        const fileProgressWeight = 100 / files.length;
        
        try {
          if (file.type === 'pdf') {
            const chunks = await extractPdfTextInChunks(file.raw, (curr, tot) => {
              if (idx === 0) { 
                setProgress(prev => ({ 
                  ...prev, 
                  subPhase: `Processando ${file.name}: ${curr}/${tot} páginas` 
                }));
              }
            });
            
            const totalText = chunks.join("");
            
            if (totalText.trim().length < 50) {
              const images = await pdfToImages(file.raw, 3); // Lesser pages for faster OCR fallback
              return { 
                type: 'pdf_ocr', 
                images, 
                text: `\n[ARQUIVO ${idx+1} - PDF ESCANEADO]` 
              };
            } else {
              return { 
                type: 'text', 
                text: `\n[ARQUIVO ${idx+1} - ${idx === 0 ? 'RELATÓRIO BASE' : 'RELATÓRIO ADICIONAL'}]: ${chunks.join("\n")}` 
              };
            }
          } else if (file.type === 'excel') {
            const excelText = await parseExcel(file.raw);
            return { 
              type: 'text', 
              text: `\n[ARQUIVO ${idx+1} - ${idx === 0 ? 'RELATÓRIO BASE' : 'RELATÓRIO ADICIONAL'}]: ${excelText}` 
            };
          } else if (file.type === 'image') {
            const b64 = await fileToBase64(file.raw);
            return { 
              type: 'image', 
              image: { inlineData: { data: b64, mimeType: file.raw.type } },
              text: `\n[ARQUIVO ${idx+1} - IMAGEM]`
            };
          }
        } catch (err) {
          console.error(`Erro ao extrair dados de ${file.name}:`, err);
          return { type: 'error', text: `\n[ERRO NO ARQUIVO ${file.name}]` };
        }
        return { type: 'unknown', text: '' };
      });

      const results = await Promise.all(processingTasks);
      
      results.forEach(res => {
        if (res?.text) allExtractedText += res.text;
        if (res?.type === 'image' && res.image) imageParts.push(res.image);
        if (res?.type === 'pdf_ocr' && res.images) imageParts.push(...res.images);
      });

      setProgress(prev => ({ ...prev, percent: 100, phase: "Arquivos lidos com sucesso!", subPhase: "Preparando envio para IA..." }));

      console.log("Conteúdo extraído para o Gemini:", allExtractedText);
      
      if (!allExtractedText && imageParts.length === 0) {
        throw new Error("Não foi possível extrair nenhum dado dos arquivos selecionados.");
      }

      setProgress(prev => ({ ...prev, phase: "A Inteligência Artificial está organizando seus dados...", subPhase: "Isso pode levar alguns segundos dependendo do volume de dados." }));
      
      const res = await extractDataFromReport(instruction, imageParts, allExtractedText);
      setResult(res);
      setActiveStep('result');
    } catch (err: any) {
      setActiveStep('config');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    else if (sortConfig.key === key && sortConfig.direction === 'desc') direction = null;
    setSortConfig({ key, direction });
  };

  const toggleColumn = (column: string) => {
    setVisibleColumns(prev => 
      prev.includes(column) ? prev.filter(c => c !== column) : [...prev, column]
    );
  };

  const filteredAndSortedData = useMemo(() => {
    if (!result) return [];
    let data = [...result.data];
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      data = data.filter(row => Object.values(row).some(val => String(val).toLowerCase().includes(lowerSearch)));
    }
    if (sortConfig.key && sortConfig.direction) {
      data.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (typeof valA === 'number' && typeof valB === 'number') return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        const strA = String(valA || '').toLowerCase();
        const strB = String(valB || '').toLowerCase();
        return sortConfig.direction === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }
    return data;
  }, [result, searchTerm, sortConfig]);

  const downloadExcel = () => {
    if (!result) return;
    
    const wb = XLSX.utils.book_new();

    // Aba 1: Dados Consolidados / Ajustados
    const ws_data = [result.headers, ...result.data.map(row => result.headers.map(h => row[h]))];
    const ws_consolidated = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws_consolidated, "Relatório Processado");

    // Aba 2: Registros Não Encontrados (se houver)
    if (result.unmatchedRecords && result.unmatchedRecords.length > 0) {
      const unmatched_headers = ["Identificador (Nome/CPF)", "Motivo da Exclusão", "Origem do Dado"];
      const unmatched_data = [
        unmatched_headers,
        ...result.unmatchedRecords.map(rec => [
          rec.name || rec.cpf || "N/A",
          rec.reason || "Não encontrado na base ou excluído por regra",
          rec.source || "Relatório Secundário"
        ])
      ];
      const ws_unmatched = XLSX.utils.aoa_to_sheet(unmatched_data);
      XLSX.utils.book_append_sheet(wb, ws_unmatched, "Itens Fora da Tabela");
    }

    XLSX.writeFile(wb, `relatorio_smart_${Date.now()}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-[#4f46e5]/10 selection:text-[#4f46e5] font-sans relative overflow-x-hidden">
      {/* Technical Background Pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0" 
           style={{ backgroundImage: `radial-gradient(#4f46e5 1px, transparent 0)`, backgroundSize: '40px 40px' }} />
      
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[100rem] mx-auto flex items-center justify-between px-4">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={() => setActiveStep('start')}
          >
            <div className="p-2 bg-[#4f46e5] rounded-xl text-white shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">SmartReport <span className="text-[#4f46e5]">Pro</span></h1>
          </motion.div>
          {activeStep !== 'start' && (
            <motion.button 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setActiveStep('start')} 
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl transition-all border border-slate-200"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </motion.button>
          )}
        </div>
      </header>

      <main className={`relative z-10 ${activeStep === 'result' ? 'max-w-none px-0' : 'max-w-7xl px-4'} mx-auto mt-12 transition-all duration-300 pb-20`}>
        <AnimatePresence mode="wait">
          {activeStep === 'start' && (
            <motion.div 
              key="start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="px-4 text-center py-10"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-widest mb-8">
                <Wand2 className="w-3 h-3" /> Inteligência de Dados
              </div>
              <h2 className="text-7xl md:text-8xl font-black text-slate-900 mb-8 tracking-tighter leading-tight">
                Relatórios <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4f46e5] to-indigo-400">Inteligentes</span><br/>& Auditoria.
              </h2>
              <p className="text-slate-500 text-xl md:text-2xl font-medium max-w-3xl mx-auto mb-16 leading-relaxed">
                Extraia, cruze ou valide seus documentos com precisão absoluta usando Inteligência Artificial de última geração.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {QUICK_ACTIONS.map((action, idx) => (
                  <motion.div 
                    key={action.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => { setInstruction(action.instruction); setActiveStep('config'); }} 
                    className="group cursor-pointer bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all border-b-[10px] border-b-slate-100 hover:border-b-indigo-500 text-left flex flex-col h-full"
                  >
                    <div className={`w-16 h-16 ${action.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
                      {action.icon}
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">{action.title}</h3>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8 flex-grow">{action.description}</p>
                    <div className="flex items-center gap-2 text-[#4f46e5] font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      Começar <ChevronRight className="w-4 h-4" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeStep === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-4xl mx-auto bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-10">
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">Processamento</h2>
                <div className="flex gap-2">
                  <div className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-wider border border-indigo-100 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    Passo 1: Fonte
                  </div>
                  <div className="bg-slate-50 text-slate-400 text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-wider border border-slate-100">
                    Passo 2: Objetivo
                  </div>
                </div>
              </div>
            
            <div className="border-[4px] border-dashed border-slate-100 rounded-[3rem] p-16 flex flex-col items-center justify-center bg-slate-50/40 hover:bg-slate-50 transition-all group mb-12">
              <UploadCloud className="w-20 h-20 text-indigo-200 mb-8 group-hover:text-[#4f46e5] transition-colors" />
              <input type="file" id="multi-file" className="hidden" multiple onChange={handleFileChange} />
              <label htmlFor="multi-file" className="bg-[#4f46e5] text-white px-12 py-5 rounded-2xl font-black cursor-pointer hover:bg-[#4338ca] shadow-2xl text-lg transition-transform active:scale-95">Anexar Arquivos</label>
              <p className="mt-6 text-slate-400 font-bold text-sm">O primeiro arquivo será usado como BASE se houver cruzamento.</p>
            </div>

            {files.length > 0 && (
              <div className="space-y-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {files.map((f, i) => (
                    <div key={i} className={`relative flex items-center justify-between p-6 rounded-[2rem] border-2 ${i === 0 ? 'border-indigo-500 bg-indigo-50/50 shadow-lg' : 'border-slate-100 bg-white'} transition-all`}>
                      <div className="flex items-center gap-4 overflow-hidden">
                        {i === 0 ? (
                          <div className="bg-indigo-500 p-2 rounded-xl text-white shadow-md"><Anchor className="w-5 h-5" /></div>
                        ) : (
                          <div className="bg-slate-100 p-2 rounded-xl text-slate-400"><FileText className="w-5 h-5" /></div>
                        )}
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{i === 0 ? 'Base / Alvo principal' : 'Documento Adicional'}</span>
                          <span className="text-sm font-bold text-slate-800 truncate">{f.name}</span>
                        </div>
                      </div>
                      <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-widest ml-4">O que a IA deve fazer?</label>
                  <textarea value={instruction} onChange={e => setInstruction(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-8 min-h-[160px] focus:border-[#4f46e5] focus:bg-white outline-none transition-all font-semibold text-lg" placeholder="Ex: 'Mantenha apenas as colunas Nome e Salário' ou 'Cruze com o arquivo 2 trazendo as comissões'" />
                </div>
                
                <button onClick={handleProcess} className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black text-xl hover:bg-black shadow-2xl flex items-center justify-center gap-4 transition-all">
                  Executar Tarefa <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {activeStep === 'processing' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto bg-white rounded-[3rem] shadow-2xl p-16 text-center border border-slate-100 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
              <motion.div 
                className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                initial={{ width: 0 }}
                animate={{ width: `${progress.percent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            <div className="relative inline-block mb-12">
              <div className="absolute inset-0 bg-[#4f46e5] blur-3xl opacity-20 animate-pulse" />
              <div className="relative bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                <Loader2 className="w-16 h-16 text-[#4f46e5] animate-spin" />
              </div>
            </div>
            
            <motion.h2 
              key={progress.phase}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-black text-slate-900 mb-4 tracking-tight"
            >
              {progress.phase}
            </motion.h2>
            <p className="text-slate-500 text-lg font-medium mb-10">{progress.subPhase}</p>
            
            <div className="flex justify-between items-end">
              <div className="text-left">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Status do Processamento</span>
                <span className="text-indigo-600 font-bold">{Math.round(progress.percent)}% Concluído</span>
              </div>
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <motion.div 
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-indigo-500"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeStep === 'result' && result && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            {/* Toolbar Full Width */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 px-12 mb-12">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                   <div className="bg-green-100 p-2 rounded-xl text-green-600"><CheckCircle className="w-6 h-6" /></div>
                   <h2 className="text-5xl font-black text-slate-900 tracking-tighter">Tarefa Concluída</h2>
                </div>
                <p className="text-slate-500 text-lg font-bold ml-1">Visualize abaixo os dados ajustados conforme sua solicitação.</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative group min-w-[500px]">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input type="text" placeholder="Filtrar resultados..." className="w-full bg-white border-2 border-slate-100 rounded-3xl py-5 pl-16 pr-8 font-bold outline-none focus:border-[#4f46e5] shadow-sm focus:shadow-2xl transition-all text-lg" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <button onClick={() => setShowColumnSettings(!showColumnSettings)} className={`p-5 rounded-3xl border-2 transition-all ${showColumnSettings ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-400'}`}><Settings2 className="w-7 h-7" /></button>
                <button onClick={downloadExcel} className="px-12 py-5 bg-green-600 text-white font-black rounded-3xl hover:bg-green-700 shadow-2xl flex items-center gap-3 text-xl transition-transform active:scale-95"><Download className="w-6 h-6" /> Exportar Tudo</button>
              </div>
            </div>

            {showColumnSettings && (
              <div className="bg-white p-10 rounded-[3rem] border-2 border-indigo-50 shadow-2xl mx-12 mb-12 animate-in slide-in-from-top-4">
                <h4 className="text-xs font-black uppercase text-slate-400 mb-8 tracking-[0.3em] flex items-center gap-3"><Filter className="w-4 h-4" /> Colunas Extraídas</h4>
                <div className="flex flex-wrap gap-3">
                  {result.headers.map(h => (
                    <button key={h} onClick={() => toggleColumn(h)} className={`px-6 py-3 rounded-2xl text-sm font-black border-2 transition-all flex items-center gap-3 ${visibleColumns.includes(h) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                      {visibleColumns.includes(h) ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />} {h}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tabela Full Width */}
            <div className="bg-white border-y border-slate-200 shadow-sm overflow-hidden w-full mb-16">
              <div className="max-h-[75vh] overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse table-auto">
                  <thead className="sticky top-0 bg-slate-900 text-white z-20">
                    <tr>
                      {result.headers.filter(h => visibleColumns.includes(h)).map(h => (
                        <th key={h} className="p-0">
                          <button onClick={() => handleSort(h)} className={`w-full text-left px-12 py-10 text-[12px] font-black uppercase tracking-[0.25em] flex items-center gap-4 hover:bg-white/10 transition-colors ${sortConfig.key === h ? 'text-indigo-400' : ''}`}>
                            {h} 
                            <div className="flex flex-col">
                              {sortConfig.key === h && sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : 
                               sortConfig.key === h && sortConfig.direction === 'desc' ? <ArrowDown className="w-4 h-4" /> : 
                               <ArrowUpDown className="w-4 h-4 opacity-20" />}
                            </div>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAndSortedData.map((row, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                        {result.headers.filter(h => visibleColumns.includes(h)).map(h => (
                          <td key={`${i}-${h}`} className="px-12 py-8 text-base font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                            {typeof row[h] === 'number' ? row[h].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : (row[h] || "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Itens não incluídos (para auditoria) */}
            {result.unmatchedRecords && result.unmatchedRecords.length > 0 && (
              <div className="mx-12 mb-20 space-y-8 animate-in slide-in-from-bottom-8">
                <div className="flex items-center gap-4 text-amber-600 bg-amber-50 p-6 rounded-[2.5rem] w-fit pr-12 border border-amber-100">
                  <AlertTriangle className="w-10 h-10" />
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight">Itens Descartados / Não Localizados</h3>
                    <p className="text-amber-700/70 font-bold">Estes registros não foram incluídos na tabela principal por divergência ou regra de ajuste.</p>
                  </div>
                </div>
                <div className="bg-white border-2 border-amber-100 rounded-[3rem] overflow-hidden shadow-2xl shadow-amber-100/30">
                  <table className="w-full text-left">
                    <thead className="bg-amber-50/50 text-amber-900 text-[11px] font-black uppercase tracking-[0.2em]">
                      <tr>
                        <th className="px-12 py-6">Entidade / Nome</th>
                        <th className="px-12 py-6">Motivo</th>
                        <th className="px-12 py-6">Origem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {result.unmatchedRecords.map((rec, i) => (
                        <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                          <td className="px-12 py-6 text-base font-black text-amber-900">{rec.name || rec.cpf || "Identificador Ausente"}</td>
                          <td className="px-12 py-6 text-sm font-semibold text-amber-600/80 italic">{rec.reason}</td>
                          <td className="px-12 py-6 text-[10px] font-black text-amber-400 uppercase tracking-widest">{rec.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.summary && (
              <div className="mx-12 p-16 bg-slate-900 text-slate-200 rounded-[4rem] shadow-2xl relative overflow-hidden mb-20">
                <div className="absolute top-0 right-0 p-12 opacity-5"><Database className="w-64 h-64 text-indigo-400" /></div>
                <div className="relative z-10 flex gap-10 items-start">
                  <div className="p-5 bg-indigo-500/20 rounded-3xl"><Info className="w-10 h-10 text-indigo-400" /></div>
                  <div className="space-y-4 max-w-4xl">
                    <h5 className="text-indigo-400 text-[11px] font-black uppercase tracking-[0.4em]">Explicação do Processamento</h5>
                    <p className="text-2xl font-medium leading-relaxed italic text-white/90">"{result.summary}"</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 12px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 20px; border: 4px solid #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        table { border-spacing: 0; }
        .max-w-none { max-width: 100vw !important; width: 100% !important; }
      `}</style>
    </div>
  );
};

export default App;
