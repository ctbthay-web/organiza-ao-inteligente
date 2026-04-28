
export interface ExtractedData {
  [key: string]: string | number | null;
}

export interface UnmatchedRecord {
  name?: string;
  cpf?: string;
  reason: string;
  source: string;
}

export interface ProcessingResult {
  data: ExtractedData[];
  headers: string[];
  summary?: string;
  unmatchedRecords?: UnmatchedRecord[];
  formulas?: { [column: string]: string }; // Ex: { "COMISSAO": "F-D-E" }
}

export interface ComparisonDiff {
  key: string; // CPF ou Nome
  field: string;
  valueA: string | null;
  valueB: string | null;
  isDifferent: boolean;
}

export interface ComparisonResult {
  data: ComparisonDiff[];
  headers: string[];
  summary?: string;
}

export type FileType = 'pdf' | 'excel' | 'image' | 'text' | 'unknown';

export interface FileMetadata {
  name: string;
  size: number;
  type: FileType;
  raw: File;
}
