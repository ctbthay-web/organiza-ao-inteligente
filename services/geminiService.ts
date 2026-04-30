
import { GoogleGenAI } from "@google/genai";
import { ProcessingResult } from "../types";

let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    // Tenta pegar do ambiente (injetado pelo Vite) ou do localStorage como fallback
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('SMART_REPORT_KEY');
    
    if (!apiKey) {
      const promptKey = prompt("Chave de API do Gemini não encontrada.\n\nPor favor, insira sua chave da Google AI Studio para continuar:");
      if (promptKey) {
        localStorage.setItem('SMART_REPORT_KEY', promptKey);
        genAIClient = new GoogleGenAI(promptKey);
      } else {
        throw new Error("Chave de API do Gemini é necessária para o processamento.");
      }
    } else {
      genAIClient = new GoogleGenAI(apiKey);
    }
  }
  return genAIClient;
}

const cleanJsonResponse = (text: string): string => {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/gm, "").replace(/```$/gm, "");
  return cleaned.trim();
};

export const extractDataFromReport = async (
  userInstruction: string,
  fileParts: { inlineData: { data: string; mimeType: string } }[],
  textContent?: string
): Promise<ProcessingResult> => {
  // Mudamos para o 2.0 Flash para VELOCIDADE MÁXIMA
  const modelId = 'gemini-2.0-flash'; 
  
  const systemInstruction = `
    Você é um Engenheiro de Dados e Auditor focado em VELOCIDADE e PRECISÃO ABSOLUTA.
    Retorne IMEDIATAMENTE um JSON completo.

    REGRAS DE OURO:
    1. EXAUSTIVIDADE: Processe TODAS as linhas encontradas. Nunca use "..." ou "etc". Se houver 100 linhas, retorne 100 objetos.
    2. FIDELIDADE: Mantenha os valores originais.
    3. MOEDA: Converta "R$ 10,00" para o número 10.00.
    4. ALVO: O Relatório 1 é sempre a base prioritária de cruzamento.
  `;

  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0
    },
  });

  const finalPrompt = `
    ESTA É UMA ORDEM CRÍTICA: Processe todos os dados abaixo sem exceção.
    
    INSTRUÇÕES DO USUÁRIO: ${userInstruction}
    
    CONTEÚDO PARA ANÁLISE:
    ${textContent || 'Analise as imagens e tabelas fornecidas.'}

    MUITO IMPORTANTE: O resultado deve ser um JSON completo contendo o array "data" com TODOS os itens identificados.
    Formato: { "data": [...], "headers": [...], "unmatchedRecords": [...], "summary": "..." }
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [...fileParts, { text: finalPrompt }] }]
    });

    const response = await result.response;
    const text = response.text();
    
    if (!text) throw new Error("Resposta vazia da IA");
    
    const parsed = JSON.parse(cleanJsonResponse(text));
    return {
      data: parsed.data || [],
      headers: parsed.headers || [],
      summary: parsed.summary,
      unmatchedRecords: parsed.unmatchedRecords || [],
      formulas: parsed.formulas || {}
    };
  } catch (error) {
    console.error("Erro na extração Gemini:", error);
    return { 
      data: [], 
      headers: [], 
      summary: "Erro no processamento. O arquivo pode ser muito grande ou a chave API está instável. Tente novamente ou use um arquivo menor." 
    };
  }
};
