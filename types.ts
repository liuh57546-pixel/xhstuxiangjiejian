
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
  prompt: string;
  gridType: 'single' | '4-grid' | '9-grid';
  selectedRatio: string;
}

export interface PromptAnalysis {
  subject: string;
  appearance: string;
  physique: string; // 新增：身材与比例描述
  action: string;
  composition: string;
  background: string;
  style: string;
  quality: string;
  gridType: 'single' | '4-grid' | '9-grid';
  shots?: string[];
}
