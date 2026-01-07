
export enum AppModel {
  FLASH = 'gemini-2.5-flash-image',
  PRO = 'gemini-3-pro-image-preview'
}

export interface AppearanceOptions {
  hair: boolean;
  features: boolean;
  body: boolean;
  clothing: boolean;
}

export interface GenerationResult {
  id: string;
  timestamp: number;
  fullImage: string;
  slices: string[];
  upscaledIndices: number[];
  loadingIndices: number[]; // 新增：记录正在重塑中的切片下标
  prompt: string;
  gridType: 'single' | '4-grid' | '9-grid';
  selectedRatio: string;
  analysisData?: PromptAnalysis; // 新增：保存完整的脚本分析数据，用于回溯编辑
}

export interface PromptAnalysis {
  subject: string;
  appearance: string;
  physique: string;
  action: string;
  composition: string;
  background: string;
  style: string;
  quality: string;
  gridType: 'single' | '4-grid' | '9-grid';
  shots?: string[];
}
