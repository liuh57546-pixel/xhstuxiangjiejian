
import React, { useState, useCallback } from 'react';
import { AppModel, GenerationResult, PromptAnalysis } from './types';
import { ImageUploader } from './components/ImageUploader';
import { analyzePrompt, generateImage, upscaleImage } from './services/geminiService';

const RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
  { id: '3:4', label: '3:4' },
  { id: '4:3', label: '4:3' },
];

const App: React.FC = () => {
  const [model, setModel] = useState<AppModel>(AppModel.PRO);
  const [manualApiKey, setManualApiKey] = useState<string>('');
  const [characterImg, setCharacterImg] = useState<string | null>(null);
  const [referenceImg, setReferenceImg] = useState<string | null>(null);
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  
  // 选项开关
  const [useReferenceStyle, setUseReferenceStyle] = useState(true); 
  const [useReferenceHair, setUseReferenceHair] = useState(false);
  const [useReferenceExpression, setUseReferenceExpression] = useState(true); 
  
  // 状态管理
  const [isAnalyzing, setIsAnalyzing] = useState(false); // 第一步：分析中
  const [isGenerating, setIsGenerating] = useState(false); // 第三步：生成中
  const [status, setStatus] = useState('');
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 中间态：脚本编辑
  const [analysisResult, setAnalysisResult] = useState<PromptAnalysis | null>(null);
  const [showScriptEditor, setShowScriptEditor] = useState(false);

  const downloadImage = (base64: string, name: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `${name}.png`;
    link.click();
  };

  const batchDownloadSlices = (id: string) => {
    const item = history.find(h => h.id === id);
    if (!item) return;
    const readySlices = item.upscaledIndices.map(idx => ({
      data: item.slices[idx],
      name: `分镜_${idx + 1}_2K_高清`
    }));
    
    if (readySlices.length === 0) return alert("暂无已就绪的 2K 高清图");
    
    readySlices.forEach((slice, i) => {
      setTimeout(() => downloadImage(slice.data, slice.name), i * 300);
    });
  };

  const sliceImage = useCallback((imgSrc: string, gridType: 'single' | '4-grid' | '9-grid'): Promise<string[]> => {
    return new Promise((resolve) => {
      if (gridType === 'single') return resolve([imgSrc]);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve([imgSrc]);
        const count = gridType === '4-grid' ? 2 : 3;
        const w = img.width / count;
        const h = img.height / count;
        canvas.width = w;
        canvas.height = h;
        const slices: string[] = [];
        for (let y = 0; y < count; y++) {
          for (let x = 0; x < count; x++) {
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, x * w, y * h, w, h, 0, 0, w, h);
            slices.push(canvas.toDataURL('image/png'));
          }
        }
        resolve(slices);
      };
      img.src = imgSrc;
    });
  }, []);

  // 第一步：点击“分析并提案”
  const handleAnalyze = async () => {
    if (!manualApiKey) return alert("请输入 API 密钥以启动模型");
    if (!characterImg || !referenceImg) return alert("请同时上传肖像图和构图参考图");

    try {
      setIsAnalyzing(true);
      setStatus('AI 正在深度反推摄影风格与材质细节...');
      
      const analysis = await analyzePrompt(
        characterImg, 
        referenceImg, 
        manualApiKey, 
        useReferenceStyle, 
        useReferenceHair, 
        useReferenceExpression
      );
      
      setAnalysisResult(analysis);
      setShowScriptEditor(true);
      setStatus('');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 第二步：用户在弹窗中修改 analysisResult (通过 UI 直接修改 state)

  // 第三步：点击“执行生成”
  const handleExecuteGeneration = async () => {
    if (!analysisResult || !characterImg) return;
    
    try {
      setShowScriptEditor(false); // 关闭编辑器
      setIsGenerating(true);
      setStatus(`正在渲染 4K 初始全景分镜总网格 (${analysisResult.gridType})...`);
      
      // 使用最新的 analysisResult 进行生成
      const url = await generateImage(model, analysisResult, manualApiKey, characterImg, selectedRatio);
      
      setStatus('分镜切片处理中...');
      const initialSlices = await sliceImage(url, analysisResult.gridType);

      const newEntry: GenerationResult = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        fullImage: url,
        slices: initialSlices,
        upscaledIndices: [],
        loadingIndices: [],
        prompt: analysisResult.shots ? JSON.stringify(analysisResult.shots) : '', 
        gridType: analysisResult.gridType,
        selectedRatio: selectedRatio
      };
      setHistory(prev => [newEntry, ...prev]);
    } catch (e: any) {
      alert(e.message);
      setShowScriptEditor(true); // 如果失败，重新打开编辑器让用户检查
    } finally {
      setIsGenerating(false);
      setStatus('');
    }
  };

  const manualUpscale = async (id: string, idx: number) => {
    const item = history.find(h => h.id === id);
    if (!item || !manualApiKey) return;
    if (item.loadingIndices.includes(idx)) return;

    setHistory(prev => prev.map(h => h.id === id ? {
      ...h,
      loadingIndices: [...h.loadingIndices, idx]
    } : h));

    try {
      let currentShotDesc = "Focus on a single subject, full body or portrait as visible.";
      try {
        if (item.prompt && item.prompt.trim().startsWith('[')) {
           const shots = JSON.parse(item.prompt);
           if (Array.isArray(shots) && shots[idx]) {
             currentShotDesc = `ONE SINGLE IMAGE: ${shots[idx]}. Absolutely no grids or splits. Enhance existing single frame content.`;
           }
        } else {
           currentShotDesc = item.prompt;
        }
      } catch(e) {}

      const up = await upscaleImage(item.slices[idx], currentShotDesc, manualApiKey, item.selectedRatio);
      
      setHistory(prev => prev.map(h => h.id === id ? { 
        ...h, 
        slices: h.slices.map((s, i) => i === idx ? up : s),
        upscaledIndices: [...new Set([...h.upscaledIndices, idx])],
        loadingIndices: h.loadingIndices.filter(li => li !== idx)
      } : h));
    } catch (e) {
      alert(`分镜 ${idx+1} 重塑失败，请检查 API 状态`);
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h,
        loadingIndices: h.loadingIndices.filter(li => li !== idx)
      } : h));
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF9] font-sans text-slate-800 pb-20">
      {/* 视觉脚本编辑器模态框 */}
      {showScriptEditor && analysisResult && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-500 border-4 border-slate-100">
            {/* 顶部标题栏 */}
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI 视觉导演脚本</h2>
                <p className="text-[10px] font-bold text-pink-500 uppercase tracking-widest mt-1">请审查并微调反推结果，随后开始渲染</p>
              </div>
              <button onClick={() => setShowScriptEditor(false)} className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* 滚动编辑区 */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50">
              
              {/* 核心风格区 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">摄影风格 & 光影 (Style & Light)</label>
                  <textarea 
                    value={analysisResult.style}
                    onChange={(e) => setAnalysisResult({...analysisResult, style: e.target.value})}
                    className="w-full h-32 p-4 bg-white border-2 border-slate-200 rounded-2xl text-xs font-medium text-slate-700 focus:border-pink-400 focus:outline-none transition-all resize-none"
                    placeholder="例如：Kodak Portra 400, grainy, hard flash..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">材质与服饰物理 (Fabric & Texture)</label>
                  <textarea 
                    value={analysisResult.appearance}
                    onChange={(e) => setAnalysisResult({...analysisResult, appearance: e.target.value})}
                    className="w-full h-32 p-4 bg-white border-2 border-slate-200 rounded-2xl text-xs font-medium text-slate-700 focus:border-pink-400 focus:outline-none transition-all resize-none"
                    placeholder="描述布料的物理属性，反光，垂坠感..."
                  />
                </div>
              </div>

              {/* 角色与体态 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">角色特征 (Character DNA)</label>
                  <textarea 
                    value={analysisResult.subject}
                    onChange={(e) => setAnalysisResult({...analysisResult, subject: e.target.value})}
                    className="w-full h-24 p-4 bg-white border-2 border-slate-200 rounded-2xl text-xs font-medium text-slate-700 focus:border-pink-400 focus:outline-none transition-all resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">体态与动作 (Pose & Physique)</label>
                  <textarea 
                    value={analysisResult.physique}
                    onChange={(e) => setAnalysisResult({...analysisResult, physique: e.target.value})}
                    className="w-full h-24 p-4 bg-white border-2 border-slate-200 rounded-2xl text-xs font-medium text-slate-700 focus:border-pink-400 focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* 场景 */}
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">背景与氛围 (Background)</label>
                  <input 
                    type="text"
                    value={analysisResult.background}
                    onChange={(e) => setAnalysisResult({...analysisResult, background: e.target.value})}
                    className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl text-xs font-medium text-slate-700 focus:border-pink-400 focus:outline-none transition-all"
                  />
                </div>

              {/* 分镜列表 (重点) */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-pink-500 uppercase tracking-widest">分镜脚本详细设定 (Shot List)</label>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-1 rounded-md">{analysisResult.gridType}</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {analysisResult.shots?.map((shot, idx) => (
                    <div key={idx} className="flex gap-4 items-start group">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0 mt-2 group-hover:bg-pink-400 group-hover:text-white transition-colors">
                        {idx + 1}
                      </div>
                      <textarea
                        value={shot}
                        onChange={(e) => {
                          const newShots = [...(analysisResult.shots || [])];
                          newShots[idx] = e.target.value;
                          setAnalysisResult({...analysisResult, shots: newShots});
                        }}
                        className="flex-1 min-h-[80px] p-4 bg-white border-2 border-slate-200 rounded-2xl text-xs text-slate-600 focus:border-pink-400 focus:outline-none transition-all resize-none leading-relaxed"
                      />
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* 底部按钮栏 */}
            <div className="p-6 border-t border-slate-100 bg-white flex items-center justify-end gap-4 shrink-0">
               <button 
                onClick={() => setShowScriptEditor(false)}
                className="px-8 py-4 rounded-2xl font-bold text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all uppercase tracking-wider"
              >
                取消
              </button>
              <button 
                onClick={handleExecuteGeneration}
                className="px-10 py-4 bg-pink-400 hover:bg-pink-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center gap-2"
              >
                <span>确认脚本并生成</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全屏放大预览功能 */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-3xl" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
             <img src={previewImage} className="max-h-[95vh] max-w-[95vw] rounded-[2rem] shadow-2xl animate-in zoom-in-95 cursor-zoom-out" onClick={() => setPreviewImage(null)} />
             <button onClick={() => setPreviewImage(null)} className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 p-3 rounded-full backdrop-blur-md text-white transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
             </button>
             <div className="absolute bottom-8 bg-white/10 backdrop-blur-md px-6 py-2 rounded-full text-white text-[10px] font-black tracking-widest uppercase">点击任意位置退出预览</div>
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-6 pt-12">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-black text-slate-800 tracking-tight">4K<span className="text-pink-400">视觉</span>工坊</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.5em] mt-3">先进 4K 网格生成与 2K 全并行并行重塑系统</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="w-full lg:w-[400px] lg:sticky lg:top-8 shrink-0 space-y-6">
            <div className="bg-white border-[6px] border-pink-50 rounded-[3.5rem] p-8 shadow-2xl shadow-pink-100/20 space-y-6">
              <div className="space-y-4">
                <input type="password" value={manualApiKey} onChange={e => setManualApiKey(e.target.value)} placeholder="请输入您的 API 密钥" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-mono outline-none focus:border-pink-300 transition-all" />
                <select value={model} onChange={e => setModel(e.target.value as AppModel)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-600 outline-none">
                  <option value={AppModel.PRO}>Gemini 3 Pro (4K 专业/2K 重塑)</option>
                  <option value={AppModel.FLASH}>Gemini 2.5 Flash (快速预览)</option>
                </select>
                <div className="grid grid-cols-5 gap-2">
                  {RATIOS.map(r => (
                    <button key={r.id} onClick={() => setSelectedRatio(r.id)} className={`py-2 rounded-xl text-[10px] font-black border-2 transition-all ${selectedRatio === r.id ? 'bg-pink-400 border-pink-400 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>{r.label}</button>
                  ))}
                </div>
                
                <div className="space-y-2 pt-2">
                  <button onClick={() => setUseReferenceStyle(!useReferenceStyle)} className={`w-full p-3 rounded-2xl flex items-center justify-between border-2 transition-all ${useReferenceStyle ? 'bg-slate-900 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>
                    <span className="text-[10px] font-black uppercase tracking-wider pl-2">风格/光影克隆</span>
                    <div className={`w-8 h-4 rounded-full transition-colors ${useReferenceStyle ? 'bg-pink-400' : 'bg-slate-200'}`} />
                  </button>
                  <button onClick={() => setUseReferenceHair(!useReferenceHair)} className={`w-full p-3 rounded-2xl flex items-center justify-between border-2 transition-all ${useReferenceHair ? 'bg-purple-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>
                    <span className="text-[10px] font-black uppercase tracking-wider pl-2">发型 DNA 同步</span>
                    <div className={`w-8 h-4 rounded-full transition-colors ${useReferenceHair ? 'bg-white' : 'bg-slate-200'}`} />
                  </button>
                  <button onClick={() => setUseReferenceExpression(!useReferenceExpression)} className={`w-full p-3 rounded-2xl flex items-center justify-between border-2 transition-all ${useReferenceExpression ? 'bg-rose-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>
                    <div className="flex items-center gap-2 pl-2">
                      <div className={`w-2 h-2 rounded-full ${useReferenceExpression ? 'bg-rose-200 animate-pulse' : 'bg-slate-200'}`} />
                      <span className="text-[10px] font-black uppercase tracking-wider">表情意图复刻</span>
                    </div>
                    <div className={`w-8 h-4 rounded-full transition-colors ${useReferenceExpression ? 'bg-white' : 'bg-slate-200'}`}>
                       <div className={`w-2 h-2 mt-1 mx-1 rounded-full transition-transform ${useReferenceExpression ? 'translate-x-4 bg-rose-600' : 'bg-slate-400'}`} />
                    </div>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ImageUploader label="上传肖像特征" onUpload={setCharacterImg} className="h-32" />
                <ImageUploader label="上传构图参考" onUpload={setReferenceImg} className="h-32" />
              </div>
              <button onClick={handleAnalyze} disabled={isAnalyzing || isGenerating} className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all ${isAnalyzing || isGenerating ? 'bg-slate-100 text-slate-300' : 'bg-pink-400 text-white shadow-2xl hover:scale-[1.02]'}`}>
                {isAnalyzing ? "正在反推脚本..." : isGenerating ? status : "第一步：AI 提案与分析"}
              </button>
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl">
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-pink-400 mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                工作流指南
              </h3>
              <ul className="space-y-4 text-[10px] font-bold text-slate-300 leading-relaxed">
                <li className="flex gap-3"><span className="text-pink-400">01</span><span>点击“分析”让 AI 提取参考图的摄影语言与景别。</span></li>
                <li className="flex gap-3"><span className="text-pink-400">02</span><span>在<b>脚本编辑器</b>中微调分镜描述，确认后开始渲染。</span></li>
                <li className="flex gap-3"><span className="text-pink-400">03</span><span>生成 4K 网格后，点击分镜进行 <b>2K 高清重塑</b>。</span></li>
              </ul>
            </div>
          </div>

          <div className="flex-1 min-h-[600px]">
            {isGenerating && (
              <div className="sticky top-8 z-50 mb-10 bg-white/90 backdrop-blur-2xl border-4 border-pink-100 rounded-[2.5rem] p-6 shadow-2xl flex items-center gap-5">
                <div className="w-10 h-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-bold text-slate-700">{status}</span>
              </div>
            )}

            {!isGenerating && history.length === 0 && (
              <div className="h-full min-h-[500px] border-[6px] border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center p-12 text-center group hover:border-pink-200 transition-colors cursor-default select-none">
                <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6 text-slate-300 group-hover:bg-pink-50 group-hover:text-pink-400 transition-all duration-500">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="text-xl font-black text-slate-300 uppercase tracking-widest group-hover:text-pink-400 transition-colors">创作画布已就绪</h3>
                <p className="text-slate-300 font-bold text-xs mt-3 group-hover:text-pink-300 transition-colors">请在左侧点击“第一步：AI 提案”，系统将为您生成拍摄脚本</p>
              </div>
            )}

            <div className="space-y-24">
              {history.map(item => (
                <div key={item.id} className="space-y-16 animate-in fade-in slide-in-from-bottom-8">
                  <div className="bg-white border-[8px] border-white rounded-[4.5rem] overflow-hidden shadow-2xl flex flex-col xl:flex-row">
                    <div className="xl:w-[480px] shrink-0 bg-slate-50 flex items-center justify-center relative group">
                      <img src={item.fullImage} className="w-full h-full object-contain cursor-zoom-in" onClick={() => setPreviewImage(item.fullImage)} />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center pointer-events-none">
                         <div className="bg-white/20 backdrop-blur-md px-6 py-2 rounded-full text-white text-[10px] font-black uppercase tracking-widest border border-white/30">点击放大总网格</div>
                      </div>
                      <div className="absolute top-8 left-8 px-4 py-2 bg-white/80 backdrop-blur-md rounded-2xl text-[9px] font-black text-slate-500 uppercase tracking-widest border border-white">
                        4K 原始网格采样
                      </div>
                    </div>
                    <div className="flex-1 p-12 flex flex-col justify-between bg-white">
                      <div>
                        <div className="flex items-center justify-between mb-8">
                           <div className="flex gap-4">
                            <span className="px-5 py-2 bg-slate-900 text-white text-[10px] font-black rounded-full uppercase tracking-[0.2em]">
                              {item.gridType === '9-grid' ? '九宫格模式' : item.gridType === '4-grid' ? '四宫格模式' : '单张模式'}
                            </span>
                           </div>
                           <button 
                            onClick={() => batchDownloadSlices(item.id)}
                            className="px-6 py-3 bg-pink-50 text-pink-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-pink-400 hover:text-white transition-all flex items-center gap-2"
                           >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                            导出全部已重塑高清图
                           </button>
                        </div>
                        <div className="p-8 bg-slate-50 rounded-[2.5rem] text-[10px] text-slate-400 font-bold leading-relaxed border border-slate-100 max-h-[200px] overflow-y-auto">
                          <p className="mb-4 text-slate-500 border-b pb-2 font-black uppercase tracking-widest">最终执行的分镜描述：</p>
                          {(() => {
                            try {
                              if (!item.prompt || !item.prompt.trim().startsWith('[')) throw new Error();
                              const shots = JSON.parse(item.prompt);
                              return Array.isArray(shots) ? shots.map((line: string, i: number) => (
                                <div key={i} className="mb-2 pl-4 border-l-2 border-pink-100">{line}</div>
                              )) : <div className="pl-4 border-l-2 border-pink-100">{item.prompt}</div>;
                            } catch(e) {
                              return <div className="pl-4 border-l-2 border-pink-100">{item.prompt}</div>;
                            }
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-10">
                        <button onClick={() => downloadImage(item.fullImage, '4K_Master_Grid')} className="px-10 py-5 bg-slate-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all">下载 4K 总表</button>
                        <div className="text-right">
                          <span className="block text-[10px] font-black text-pink-300 uppercase">2K HD 转换进度</span>
                          <span className="text-sm font-bold text-slate-800">{item.upscaledIndices.length} / {item.slices.length} 已完成</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`grid gap-10 ${item.gridType === 'single' ? 'grid-cols-1 max-w-2xl mx-auto' : item.gridType === '4-grid' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {item.slices.map((slice, i) => (
                      <div key={i} className="group relative bg-white border-[10px] border-white shadow-2xl rounded-[4rem] overflow-hidden transition-all hover:-translate-y-2">
                        <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden">
                          <img src={slice} className={`w-full h-full object-cover transition-all duration-700 ${item.loadingIndices.includes(i) ? 'opacity-30 scale-95 blur-sm' : ''}`} />
                          
                          {item.loadingIndices.includes(i) && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                              <div className="w-12 h-12 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-[10px] font-black text-pink-500 uppercase tracking-widest animate-pulse">2K 像素重构中...</span>
                            </div>
                          )}

                          <div className="absolute inset-0 bg-slate-900/70 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center p-10 gap-4 backdrop-blur-sm">
                            <button onClick={() => setPreviewImage(slice)} className="w-full py-4 bg-white text-slate-900 text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-pink-100 transition-all flex items-center justify-center gap-2">
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
                               全屏放大预览
                            </button>
                            <button onClick={() => downloadImage(slice, `分镜_${i+1}`)} className="w-full py-4 bg-slate-100 text-slate-900 text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-white transition-all">保存此分镜</button>
                            <button 
                              onClick={() => manualUpscale(item.id, i)} 
                              disabled={item.loadingIndices.includes(i)}
                              className={`w-full py-4 text-[10px] font-black rounded-2xl uppercase tracking-widest transition-all ${
                                item.upscaledIndices.includes(i) ? 'bg-emerald-500 text-white' : 'bg-pink-500 text-white hover:bg-pink-600'
                              }`}
                            >
                              {item.upscaledIndices.includes(i) ? "重新高清重塑" : "启动 2K HD 重塑"}
                            </button>
                          </div>

                          <div className="absolute top-8 left-8">
                            {item.upscaledIndices.includes(i) ? (
                              <div className="bg-emerald-500 text-white text-[9px] font-black px-4 py-1.5 rounded-full shadow-lg border-2 border-white">2K HD 成品</div>
                            ) : item.loadingIndices.includes(i) ? (
                              <div className="bg-amber-400 text-white text-[9px] font-black px-4 py-1.5 rounded-full shadow-lg border-2 border-white animate-pulse">正在重构</div>
                            ) : (
                              <div className="bg-slate-400 text-white text-[9px] font-black px-4 py-1.5 rounded-full shadow-lg border-2 border-white">4K 原始采样</div>
                            )}
                          </div>
                        </div>
                        <div className="p-6 text-center border-t border-slate-50">
                          <span className="text-[12px] font-black text-slate-800 uppercase tracking-[0.4em]">分镜图 {i + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
