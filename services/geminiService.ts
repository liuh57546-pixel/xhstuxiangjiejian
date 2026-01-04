
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
  useReferenceHair: boolean = false // 新增：是否复刻参考图发型
): Promise<PromptAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY || '' });
  
  // 1. 风格与氛围指令
  const styleInstruction = useReferenceStyle
    ? `3. ATMOSPHERE CLONING (氛围复刻): 
       - 仔细观察图2的【光影质感】。如果是柔光(Soft Focus)、梦幻散景(Dreamy Bokeh)、暖色调(Warm Glow)，必须完全照搬。
       - 严禁生成高对比度、死黑阴影的“硬照”。画面必须通透、有空气感(Airy)。`
    : `3. ATMOSPHERE: Use High-end commercial studio lighting. Clean and crisp.`;

  // 2. 发型指令
  const hairInstruction = useReferenceHair
    ? `4. HAIR OVERRIDE (强制复刻发型): 
       - 忽略图1人物原本的发型和发色。
       - 必须完美复刻图2中的发型（如：Loose Wavy Blonde Hair, Air Bangs）。发丝必须蓬松、有流动感，严禁生成僵硬的麻花辫或紧贴头皮的发型。`
    : `4. HAIR PRESERVATION: Keep the hairstyle and color from Image 1.`;

  const prompt = `你是一位追求极致唯美风格的电影导演和服装设计师。
  
  请分析上传的两张图，为 Gemini 3 Pro 编写一份【细节极其繁复】且【氛围感极强】的视觉脚本。
  
  【任务核心指令】：
  1. 布局精准化: 识别图2是 Single, 2x2, 还是 3x3。
  2. 人像 DNA: 提取图1的面部特征，但表情要更像图2那样自然松弛。
  ${styleInstruction}
  ${hairInstruction}
  5. 服装细节狂魔 (Complex Details):
     - 不要只说“红色斗篷”。必须描述细节：Velvet texture, white fur trim, satin ribbons, intricate lace layers, bowknots.
     - 还原服装的复杂性，不要简化设计。
  
  【动作与解剖学 (极度重要)】:
  - 动作描述必须包含【微动作 (Micro-movements)】：例如“手指轻轻搭在帽檐，指尖微翘”、“眼神流转”。
  - 严禁出现“握拳 (Clenched fists)”或僵硬的摆拍姿势。手部必须是 Relaxed, Elegant fingers。
  - 每一帧都要详细描述：人物与环境的互动（如身体重心依靠在哪里）。

  请以严格 JSON 返回：
  {
    "subject": "Detailed face description + Hairstyle instructions",
    "appearance": "Extremely detailed clothing description (mention fabrics, bows, laces)",
    "physique": "Body proportions and relaxed posture",
    "background": "Detailed background with lighting info (e.g. Christmas lights with bokeh)",
    "style": "Art style (e.g. Soft Focus, Dreamy, Cinematic, Ethereal)",
    "gridType": "single 或 4-grid 或 9-grid",
    "shots": [
       "FRAME 1: [景别/角度] + [详细动作：身体朝向、手部具体姿态] + [表情神态] + [光影氛围]",
       "FRAME 2: ..."
    ]
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
      appearance: data.appearance || "luxury high-end outfit with intricate details",
      physique: data.physique || "elegant posture",
      action: "Natural interaction",
      composition: `MASTER_LAYOUT: ${data.gridType}`,
      background: data.background || "dreamy background with bokeh",
      style: data.style || "Soft focus, ethereal aesthetic",
      quality: "Masterpiece, 8k, best quality",
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
    DIRECTIVE: CREATE A ${gridDesc} WITH A "DREAMY & ETHEREAL" AESTHETIC.
    
    VISUAL STYLE:
    - FILTER: ${analysis.style} (Must use Soft Focus, diffused lighting).
    - LIGHTING: Warm, glowing, cinematic bokeh. NO HARSH SHADOWS.
    - DETAILS: High fidelity clothing textures (Ribbons, Lace, Fur).
    
    CRITICAL RULES:
    1. FACE FIDELITY: Character face from Image 1.
    2. HANDS & POSE: HANDS MUST BE RELAXED AND ELEGANT. NO FISTS. Fingers should be distinct and natural.
    3. HAIR: Follow instructions in subject description (Flowing, airy).
    4. NO REPETITION: Unique poses for each frame.
    
    CONTEXT:
    Subject: ${analysis.subject}
    Outfit: ${analysis.appearance}
    Environment: ${analysis.background}
    
    DETAILED SHOT SCRIPT:
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
        { text: `TASK: HIGH-FIDELITY RESTORATION & BEAUTIFICATION (2K).
        
        GOAL: Restore the image with a "Dreamy/Soft" filter while fixing anatomy.
        
        STRICT RULES:
        1. ATMOSPHERE: Maintain the soft, warm, bokeh-filled atmosphere. Do not sharpen too much to lose the dreaminess.
        2. ANATOMY: FIX HANDS. Fingers must be elegant and relaxed. Fix eyes to be symmetrical.
        3. INTEGRITY: Do not change the pose or composition.
        4. TEXTURE: Enhance the velvet and fur textures of the clothing.
        
        CONTEXT: ${soloDesc}` }
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
