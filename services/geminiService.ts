
import { GoogleGenAI, GenerateContentResponse, ThinkingLevel } from "@google/genai";
import { ProcessingResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  const model = 'gemini-2.0-flash'; // High-speed production model
  
  const systemInstruction = `
    Você é um Engenheiro de Dados focado em VELOCIDADE e PRECISÃO.
    Retorne IMEDIATAMENTE um JSON completo.

    REGRAS:
    1. EXAUSTIVIDADE: Processe TODAS as linhas. Nunca use "..." ou "etc".
    2. FIDELIDADE: Mantenha os valores originais.
    3. MOEDA: Converta "R$ 10,00" para 10.00.
    4. ALVO: O Relatório 1 é a base.

    ESTRUTURA JSON OBRIGATÓRIA:
    {
      "data": [
        { "Campo1": "...", "Campo2": 0.00 }
      ],
      "headers": ["Campo1", "Campo2"],
      "unmatchedRecords": [
        { "name": "...", "reason": "Motivo da exclusão", "source": "Relatório de origem" }
      ],
      "summary": "Resumo técnico do que foi feito."
    }
  `;

  const finalPrompt = `
    INSTRUÇÕES DO USUÁRIO: ${userInstruction}
    
    CONTEÚDO DOS ARQUIVOS:
    ${textContent || 'Analise as imagens e tabelas fornecidas.'}

    MUITO IMPORTANTE: Esta lista de dados pode ser longa. Você DEVE retornar TODOS os itens. Se houver 100 linhas no conteúdo, retorne 100 objetos no array "data". NUNCA interrompa o processamento antes do fim.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: { parts: [...fileParts, { text: finalPrompt }] },
      config: { 
        systemInstruction, 
        responseMimeType: "application/json", 
        temperature: 0
      }
    });

    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA");
    
    const result = JSON.parse(cleanJsonResponse(text));
    return {
      data: result.data || [],
      headers: result.headers || [],
      summary: result.summary,
      unmatchedRecords: result.unmatchedRecords || [],
      formulas: result.formulas || {}
    };
  } catch (error) {
    console.error("Erro na extração Gemini:", error);
    return { 
      data: [], 
      headers: [], 
      summary: "Não foi possível processar. Verifique se os arquivos contêm dados legíveis." 
    };
  }
};
