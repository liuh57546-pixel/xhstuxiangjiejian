
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
  
  // 深度风格与摄影语言反推指令 (保留核心摄影美学)
  const styleInstruction = useReferenceStyle
    ? `3. 深度摄影美学与质感反推 (Crucial Style Extraction)：
       不要只描述"风格"，必须基于以下 5 个维度深度解构图2的视觉语言：
       A. 摄影器材与介质: 胶片感(Grainy film)? 数码直出? 镜头畸变?
       B. 光线物理属性: 寻找直射闪光灯(Direct flash)、硬光、过曝点。拒绝平庸柔光。
       C. 生理细节与真实感: 皮肤纹理(Texture/Pores)、真实妆容瑕疵、发丝凌乱感。
       D. 构图的随意性: 动态模糊、不完美构图、生活快照感。
       E. 氛围与环境叙事: 空气感、环境杂物。`
    : `3. 大气：高品质商业摄影棚灯光，完美布光。`;

  const hairInstruction = useReferenceHair
    ? `4. 发型覆盖：忽略图1的发型，完全复制图2的发型和颜色。`
    : `4. 发型保留：保留图1的人脸及发型基因。`;

  const expressionInstruction = useReferenceExpression
    ? `5. 表情克隆：分析图2的微表情（眼神、嘴角弧度、情绪氛围），并将其转化到脚本中。`
    : `5. 正面表情引擎：忽略图2表情，生成一系列自然亲和的正面情绪描述。`;

  const prompt = `分析图像为 Gemini 3 Pro 编写极具电影感或胶片感的视觉脚本。
  任务：提取图1的人脸，提取图2的构图、景别、穿着细节和深度摄影风格。
  
  关键要求：
  1. 景别一致性：深度分析图2的每一帧是【全身】、【半身】还是【特写】，必须在脚本中明确指定景别（Shot Size）。
  2. 角色提取：从图1提取面部细节。
  ${styleInstruction}
  ${hairInstruction}
  ${expressionInstruction}
  
  6. 极致服饰与材质物理分析 (High-Fidelity Fashion & Texture Analysis):
     - 不要预设任何特定款式（如露肩或丝袜），而是**完全忠实于图2**的视觉信息，但描述必须极度细腻。
     - **材质物理属性**：深度分析衣物是硬挺的（如丹宁、皮革）、柔软的（如棉麻）、还是流动的（如丝绸、薄纱）。描述光线如何在织物表面反射（哑光、丝光、高光）。
     - **穿着状态**：观察衣褶的走向、布料的垂坠感、是否贴身或宽松。
     - **透视与层次**：如果存在透明/半透明材质（如蕾丝、薄纱、丝袜），需精确描述其透光度和肤色透出的质感。
     
  7. 鞋履检测：仅当图2（参考图）中**清晰可见**鞋子时，请简要描述鞋子的款式和颜色；否则**严禁捏造**。
  8. 肢体：放松优雅的手部，严禁握拳。
  
  9. 黄金比例与体态微调 (Pose Refinement & Golden Ratio):
     - **核心原则：严格保持图2的原始姿势和动作，不要改变动作本身。**
     - **美学优化**：在保持原动作的基础上，应用“黄金比例”美学视角进行微调。例如：如果图2有腿部展示，通过微调透视或延伸感，让肢体线条看起来更流畅、修长（Elongated visual lines），避免视觉上的压缩感，但绝不能把“坐姿”改成“站姿”，也不能强行改变腿部摆放位置。
  
  返回 JSON 格式：
  {
    "subject": "详细的角色描述",
    "appearance": "服饰细节（重点：材质物理属性、光泽感、垂坠感）",
    "physique": "体态描述（包含基于原动作的线条美化）",
    "background": "背景环境",
    "style": "包含摄影器材、光线物理、瑕疵质感、构图语言的详细风格描述",
    "gridType": "single | 4-grid | 9-grid",
    "shots": ["分镜 1: [景别] + [摄影角度] + [光线] + [动作] + [穿着细节] + [表情]", "..."]
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
      style: data.style || "film photography, grain",
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

  // 在生成阶段，移除特定的诱惑性检查，转为强调反推得到的物理材质
  const finalPrompt = `
    CREATE A ${gridDesc} IN ${targetSize} RESOLUTION.
    
    PHOTOGRAPHY & TEXTURE: ${analysis.style}. 
    (Emphasize film grain, specific lens characteristics, lighting imperfections, and skin texture as described).
    
    CHARACTER DNA: ${analysis.subject}
    
    OUTFIT & FABRIC PHYSICS: ${analysis.appearance}
    (Render the exact fabric textures - silk, denim, leather, cotton - with realistic light interaction and drape as analyzed).
    
    PHYSIQUE: ${analysis.physique}
    BACKGROUND: ${analysis.background}
    
    CRITICAL RULES: 
    1. RELAXED ELEGANT HANDS. 
    2. FACE MUST LOOK LIKE IMAGE 1. 
    3. STRICTLY ADHERE TO THE SHOT SIZES AND POSES IN THE SCRIPT.
    
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
        4. KEEP THE SHOT SIZE EXACTLY AS INPUT.
        
        PHOTOGRAPHY STYLE ENHANCEMENT:
        Retain the original film grain, lens distortion, and lighting atmosphere. Do not over-smooth the skin.
        
        CONTENT & TEXTURE RESTORATION:
        Focus on hyper-realistic fabric textures and skin details. Maintain the original clothing fit and drape exactly as seen in the base image.
        
        CONTENT DESCRIPTION:
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
