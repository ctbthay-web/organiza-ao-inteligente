
import * as XLSX from 'xlsx';

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
};

export const parseExcel = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      let fullText = "";
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        fullText += `\n--- Planilha: ${sheetName} ---\n`;
        // Convertendo para CSV para manter a estrutura de tabela
        fullText += XLSX.utils.sheet_to_csv(worksheet);
      });
      resolve(fullText);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const parseCsv = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

/**
 * Extrai texto de um PDF em lotes para suportar documentos massivos.
 */
export const extractPdfTextInChunks = async (
  file: File, 
  pageSize: number = 20,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> => {
  const url = URL.createObjectURL(file);
  // @ts-ignore
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  try {
    const pdf = await pdfjsLib.getDocument(url).promise;
    const numPages = pdf.numPages;
    const chunks: string[] = [];
    
    // Process pages in batches to avoid overwhelming memory but still benefit from parallelism
    const batchSize = 25;
    for (let startPage = 1; startPage <= numPages; startPage += batchSize) {
      const endPage = Math.min(startPage + batchSize - 1, numPages);
      const pagePromises = [];
      
      for (let i = startPage; i <= endPage; i++) {
        pagePromises.push(
          pdf.getPage(i).then(async (page: any) => {
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(" ");
            page.cleanup();
            return { index: i, text: `\n--- PÁGINA ${i} ---\n${pageText}` };
          })
        );
      }
      
      const pageResults = await Promise.all(pagePromises);
      pageResults.sort((a, b) => a.index - b.index);
      
      const batchText = pageResults.map(r => r.text).join("");
      chunks.push(batchText);
      
      if (onProgress) onProgress(endPage, numPages);
    }
    
    // Safety check: ensure we didn't miss anything
    if (chunks.length === 0 && numPages > 0) {
      throw new Error("Falha na extração de texto: nenhum dado recuperado das páginas.");
    }

    return chunks;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Converte PDF para imagens (útil para OCR quando o texto não é extraível)
 */
export const pdfToImages = async (file: File, maxPages: number = 10): Promise<{ inlineData: { data: string; mimeType: string } }[]> => {
  const url = URL.createObjectURL(file);
  // @ts-ignore
  const pdfjsLib = window.pdfjsLib;
  
  try {
    const pdf = await pdfjsLib.getDocument(url).promise;
    const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];
    const pagesToProcess = Math.min(pdf.numPages, maxPages);

    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      if (context) {
        await page.render({ canvasContext: context, viewport }).promise;
        const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
        imageParts.push({ inlineData: { data: base64, mimeType: 'image/jpeg' } });
      }
      page.cleanup();
    }
    return imageParts;
  } finally {
    URL.revokeObjectURL(url);
  }
};
