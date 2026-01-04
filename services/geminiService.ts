
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
  useReferenceHair: boolean = false,
  useReferenceExpression: boolean = true
): Promise<PromptAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  
  const styleInstruction = useReferenceStyle
    ? `3. 大气克隆：复制图2的光影（如柔焦、虚化、暖光）。`
    : `3. 大气：高品质商业摄影棚灯光。`;

  const hairInstruction = useReferenceHair
    ? `4. 发型覆盖：忽略图1的发型，完全复制图2的发型和颜色。`
    : `4. 发型保留：保留图1的人脸及发型基因。`;

  const expressionInstruction = useReferenceExpression
    ? `5. 表情克隆：分析图2的微表情（眼神、嘴角弧度、情绪氛围），并将其转化到脚本中。`
    : `5. 正面表情引擎：忽略图2表情，生成一系列自然亲和的正面情绪描述（如：恬静微笑、俏皮眼神、优雅喜悦、梦幻神情）。`;

  const prompt = `分析图像为 Gemini 3 Pro 编写视觉脚本。
  任务：提取图1的人脸，提取图2的构图、景别和风格。
  
  关键要求：
  1. 景别一致性：深度分析图2的每一帧是【全身】、【半身】还是【特写】，必须在脚本中明确指定景别（Shot Size）。
  2. 角色提取：从图1提取面部细节。
  ${styleInstruction}
  ${hairInstruction}
  ${expressionInstruction}
  6. 服饰细节：描述织物（天鹅绒、蕾丝）、装饰物。
  7. 肢体：放松优雅的手部，严禁握拳。
  
  返回 JSON 格式：
  {
    "subject": "详细的角色描述",
    "appearance": "服饰细节",
    "physique": "体态描述",
    "background": "背景环境",
    "style": "视觉风格",
    "gridType": "single | 4-grid | 9-grid",
    "shots": ["分镜 1: [景别：全身/半身/特写] + [角度] + [具体表情] + [动作]", "..."]
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
    const text = response.text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(text);
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
    throw new Error("视觉脚本分析失败，请检查图像质量或 API 状态。");
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

  const gridDesc = analysis.gridType === '9-grid' ? '3x3 GRID MATRIX (9 PANELS)' : 
                   analysis.gridType === '4-grid' ? '2x2 GRID MATRIX (4 PANELS)' : 
                   'SINGLE LARGE FRAME';

  const isGrid = analysis.gridType !== 'single';
  const targetSize = isGrid ? "4K" : "2K";

  const finalPrompt = `
    CREATE A ${gridDesc} IN ${targetSize} RESOLUTION.
    VISUAL STYLE: ${analysis.style}, soft lighting.
    CHARACTER DNA: ${analysis.subject}
    OUTFIT: ${analysis.appearance}
    BACKGROUND: ${analysis.background}
    CRITICAL RULES: RELAXED ELEGANT HANDS. FACE MUST LOOK LIKE IMAGE 1. 
    ADHERE TO THE SPECIFIC SHOT SIZES (Full body, medium, close-up) IN THE SCRIPT.
    
    DETAILED SCRIPT:
    ${analysis.shots?.join('\n\n') || ''}
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
        imageSize: targetSize as any
      }
    }
  });
  
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("初始网格生成失败。");
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
        { text: `TASK: 2K HIGH-DEFINITION RECONSTRUCTION OF THIS SINGLE SHOT.
        
        STRICT OUTPUT RULES:
        1. OUTPUT ONLY ONE (1) SINGLE SEAMLESS IMAGE.
        2. NO GRIDS, NO MULTIPLE PANELS, NO COLLAGES.
        3. NO BORDERS OR WHITE LINES.
        4. KEEP THE SHOT SIZE (Full body, half body, or close-up) EXACTLY AS IN THE INPUT IMAGE.
        
        ENHANCEMENT TARGET:
        ${description.substring(0, 500)}` }
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
