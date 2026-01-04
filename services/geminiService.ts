
import { GoogleGenAI, Type } from "@google/genai";
import { AppModel, PromptAnalysis } from "../types";

const compressImage = async (base64: string, maxMB = 1): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = Math.min(1, (maxMB * 1024 * 1024) / (base64.length * 0.75));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = base64;
  });
};

export const analyzePrompt = async (
  characterImage: string,
  referenceImage: string,
  apiKey: string,
  useReferenceStyle: boolean = true,
  useReferenceHair: boolean = false
): Promise<PromptAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  
  const styleInstruction = useReferenceStyle
    ? `3. ATMOSPHERE CLONING: Replicate the lighting from Image 2 (e.g., Soft Focus, Bokeh, Warm Glow). Avoid harsh shadows.`
    : `3. ATMOSPHERE: High-end commercial studio lighting.`;

  const hairInstruction = useReferenceHair
    ? `4. HAIR OVERRIDE: Ignore Image 1's hair. Replicate Image 2's hair style and color exactly (e.g., wavy blonde).`
    : `4. HAIR PRESERVATION: Keep hair from Image 1.`;

  const prompt = `Analyze images to create a visual script for Gemini 3 Pro.
  Task: Extract face from Image 1, layout and style from Image 2.
  ${styleInstruction}
  ${hairInstruction}
  5. DETAILED OUTFIT: Describe fabrics (velvet, lace), decorations (ribbons, bows). Do not simplify.
  6. ANATOMY & POSING: Describe micro-movements (relaxed fingers, elegant lean). NO FISTS.
  
  Return JSON:
  {
    "subject": "string",
    "appearance": "string",
    "physique": "string",
    "background": "string",
    "style": "string",
    "gridType": "single | 4-grid | 9-grid",
    "shots": ["FRAME 1: description", "..."]
  }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: (await compressImage(characterImage)).split(',')[1], mimeType: 'image/jpeg' } },
        { inlineData: { data: (await compressImage(referenceImage)).split(',')[1], mimeType: 'image/jpeg' } },
        { text: prompt }
      ]
    },
    config: { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 4000 } }
  });

  try {
    const data = JSON.parse(response.text.replace(/```json|```/g, '').trim());
    return {
      subject: data.subject || "Detailed model",
      appearance: data.appearance || "intricate outfit",
      physique: data.physique || "elegant posture",
      action: "Natural",
      composition: data.gridType,
      background: data.background || "dreamy",
      style: data.style || "soft focus",
      quality: "Masterpiece",
      gridType: data.gridType || "single",
      shots: data.shots || []
    };
  } catch (e) {
    throw new Error("视觉脚本分析失败。");
  }
};

export const generateImage = async (
  model: AppModel,
  analysis: PromptAnalysis,
  apiKey: string,
  characterBase64: string,
  aspectRatio: string = "1:1"
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  const compressedChar = await compressImage(characterBase64);

  const gridDesc = analysis.gridType === '9-grid' ? '3x3 GRID MATRIX' : 
                   analysis.gridType === '4-grid' ? '2x2 GRID MATRIX' : 
                   'SINGLE FRAME';

  // 关键改动：网格模式下使用 4K 分辨率
  const isGrid = analysis.gridType !== 'single';
  const targetSize = isGrid ? "4K" : "2K";

  const shotsContent = analysis.shots?.join('\n\n') || '';

  const finalPrompt = `
    CREATE A ${gridDesc} IN ${targetSize} RESOLUTION.
    STYLE: ${analysis.style}, soft lighting, warm bokeh.
    SUBJECT: ${analysis.subject}
    OUTFIT: ${analysis.appearance}
    RULES: RELAXED ELEGANT HANDS, NO FISTS. FACE FIDELITY TO IMAGE 1.
    SCRIPT:
    ${shotsContent}
  `;

  const response = await ai.models.generateContent({
    model: model,
    contents: { 
      parts: [
        { inlineData: { data: compressedChar.split(',')[1], mimeType: 'image/jpeg' } },
        { text: finalPrompt }
      ] 
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: targetSize as any // 初始生成使用 4K (如果是网格)
      }
    }
  });
  
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("4K 原图生成失败。");
};

export const upscaleImage = async (
  base64Image: string,
  description: string,
  apiKey: string,
  aspectRatio: string = "1:1"
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  
  const response = await ai.models.generateContent({
    model: AppModel.PRO,
    contents: {
      parts: [
        { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
        { text: `TASK: 2K HIGH-FIDELITY UPSCALING.
        FOCUS: Soften lighting, fix fingers to be elegant/distinct, maintain ${aspectRatio} aspect ratio.
        DESCRIPTION: ${description.substring(0, 500)}` }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: "2K"
      }
    }
  });
  
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  return base64Image;
};
