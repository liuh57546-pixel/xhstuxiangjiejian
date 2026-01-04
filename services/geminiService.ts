
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
  apiKey: string
): Promise<PromptAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  
  const prompt = `你是一位世界顶级的时尚摄影导演、解剖学视觉专家和构图大师。
  
  请分析上传的两张图，为 Gemini 3 Pro 编写一份【极高保真度】的视觉脚本。
  
  【任务核心】：
  1. 布局精准化: 识别图2是 Single, 2x2, 还是 3x3。
  2. 人像 DNA 锁定: 深度提取图1人物的面部几何、神态、发丝细节。
  3. 解剖学与审美结合: 
     - 必须分析图2每个格子的【景别】（如：低角度仰拍全景、高角度俯拍特写）。
     - 必须分析每个格子的【肢体状态】：特别是手指的摆放、脚尖的方向、关节的折叠角度。
     - 描述应包含：手部动作细节（如：指尖轻触下巴、手掌自然舒展）、腿部线条走向。
  
  【分镜描述规范】：
  - 严禁出现只有背影或脸部缺失的情况。
  - 每一帧必须描述：[景别] + [构图角度] + [人物核心动作] + [手/脚摆放细节] + [光影氛围]。
  - 风格词汇：Photorealistic, 8k resolution, cinematic atmosphere, perfect anatomy, high-end skin texture.
  
  请以严格 JSON 返回：
  {
    "subject": "极其详细的人脸特征描述",
    "appearance": "服装材质（如刺绣、亮片、丝绸）与颜色细节",
    "physique": "身材比例与优雅姿态描述",
    "background": "环境背景细节与光影分布",
    "style": "整体艺术风格与画质级别",
    "gridType": "single 或 4-grid 或 9-grid",
    "shots": ["对应网格数量的、包含景别/构图/肢体细节的长描述..."]
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
      subject: data.subject || "Detailed professional face model",
      appearance: data.appearance || "luxury high-end outfit",
      physique: data.physique || "perfect anatomical proportions",
      action: "Cinematic performance",
      composition: `MASTER_LAYOUT: ${data.gridType}`,
      background: data.background || "studio set",
      style: data.style || "hyper-realistic fashion photography",
      quality: "Masterpiece, cinematic lighting, 8k, flawless anatomy",
      gridType: data.gridType || "single",
      shots: data.shots || []
    };
  } catch (e) {
    throw new Error("视觉脚本生成失败。");
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

  const shotsContent = analysis.shots?.map((s, i) => `FRAME_${i+1}: ${s}`).join('\n\n');

  const finalPrompt = `
    DIRECTIVE: CREATE A ${gridDesc} FEATURING A HIGH-END FASHION EDITORIAL.
    
    CRITICAL RULES:
    1. FACE FIDELITY: CHARACTER FACE MUST BE IDENTICAL TO THE ATTACHED IMAGE.
    2. ANATOMICAL PERFECTION: FOCUS ON PERFECT HANDS, FINGERS, AND FEET POSITIONS.
    3. NO REPETITION: EACH FRAME MUST BE A UNIQUE POSE AND SHOT TYPE AS DESCRIBED.
    4. FACE VISIBILITY: ENSURE THE FACE IS VISIBLE IN ALL FRAMES.
    
    VISUAL CONTEXT:
    STYLE: ${analysis.style}, ${analysis.quality}
    ENVIRONMENT: ${analysis.background}
    CLOTHING: ${analysis.appearance}
    
    FRAME BY FRAME GUIDANCE:
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
        imageSize: "2K"
      }
    }
  });
  
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("初稿渲染失败。");
};

export const upscaleImage = async (
  base64Image: string,
  description: string,
  apiKey: string,
  aspectRatio: string = "1:1"
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  
  const soloDesc = description
    .replace(/grid|3x3|2x2|matrix|cells|shots|layout|sequence|collection|multiple|set of|nine|four/gi, 'single')
    .replace(/FRAME_\d+/gi, 'the specific frame')
    .trim();

  const response = await ai.models.generateContent({
    model: AppModel.PRO,
    contents: {
      parts: [
        { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
        { text: `TASK: CRYSTAL CLEAR 2K FIDELITY ENHANCEMENT. 
        
        GOAL: IMPROVE REALISM AND CORRECT ANATOMY WITHOUT CHANGING THE ORIGINAL COMPOSITION.
        
        STRICT OPERATIONAL DIRECTIVES:
        1. MAINTAIN POSE: DO NOT CHANGE THE PERSON'S POSE, COMPOSITION, OR CAMERA ANGLE.
        2. ANATOMY CORRECTION: IF HANDS, FINGERS, OR FEET ARE DISTORTED, REPAIR THEM TO BE PHYSICALLY ACCURATE.
        3. REALISM: ENHANCE SKIN PORES, FABRIC TEXTURE, AND EYE SPECULAR HIGHLIGHTS.
        4. SINGLE FRAME: ENSURE THIS REMAINS ONE SINGLE PORTRAIT. REMOVE ANY MINI-GRIDS OR BORDERS.
        
        CONTEXTUAL GUIDE: ${soloDesc}` }
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
