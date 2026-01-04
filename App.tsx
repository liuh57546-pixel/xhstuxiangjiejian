
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const downloadImage = (base64: string, name: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `${name}.png`;
    link.click();
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

  const handleGenerate = async () => {
    if (!manualApiKey) return alert("请输入 API KEY");
    if (!characterImg || !referenceImg) return alert("请上传图片");

    try {
      setIsGenerating(true);
      setStatus('深度视觉分析中 (Pro)...');
      const analysis = await analyzePrompt(characterImg, referenceImg, manualApiKey);
      
      setStatus(`渲染 ${analysis.gridType === 'single' ? '单图' : analysis.gridType === '4-grid' ? '四宫格' : '九宫格'}...`);
      const url = await generateImage(model, analysis, manualApiKey, characterImg, selectedRatio);
      
      setStatus('切片处理...');
      const initialSlices = await sliceImage(url, analysis.gridType);

      const newId = Date.now().toString();
      const newEntry: GenerationResult = {
        id: newId,
        timestamp: Date.now(),
        fullImage: url,
        slices: initialSlices,
        upscaledIndices: [],
        prompt: analysis.shots?.join('\n') || '',
        gridType: analysis.gridType,
        selectedRatio: selectedRatio
      };
      setHistory(prev => [newEntry, ...prev]);

      const finalSlices = [...initialSlices];
      const finalIndices: number[] = [];
      
      for (let i = 0; i < initialSlices.length; i++) {
        setStatus(`全自动 2K 极致重塑 (${i + 1}/${initialSlices.length})...`);
        try {
          // 这里的 prompt 已经是通过 Pro 模型高度优化过的了
          const up = await upscaleImage(initialSlices[i], newEntry.prompt, manualApiKey, selectedRatio);
          finalSlices[i] = up;
          finalIndices.push(i);
          
          setHistory(prev => prev.map(h => h.id === newId ? { 
            ...h, 
            slices: [...finalSlices], 
            upscaledIndices: [...finalIndices] 
          } : h));
        } catch (e) {
          console.error(`Shot ${i} failed`, e);
        }
      }
      
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
      setStatus('');
    }
  };

  const manualUpscale = async (id: string, idx: number) => {
    const item = history.find(h => h.id === id);
    if (!item || !manualApiKey) return;
    setStatus(`再次重塑镜头 ${idx + 1}...`);
    try {
      const up = await upscaleImage(item.slices[idx], item.prompt, manualApiKey, item.selectedRatio);
      setHistory(prev => prev.map(h => h.id === id ? { 
        ...h, slices: h.slices.map((s, i) => i === idx ? up : s),
        upscaledIndices: [...new Set([...h.upscaledIndices, idx])]
      } : h));
    } catch (e) {
      alert("重塑失败");
    } finally {
      setStatus('');
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF9] font-sans text-slate-800 pb-20 selection:bg-pink-100 selection:text-pink-600">
      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="max-h-[95vh] rounded-[2rem] shadow-2xl animate-in zoom-in-95" />
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-6 pt-12">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-black text-slate-800 tracking-tight">2K<span className="text-pink-400">视觉</span>工坊</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.5em] mt-3">High-End Aesthetic Reconstruction • Gemini 3 Pro Powered</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="w-full lg:w-[400px] lg:sticky lg:top-8 shrink-0">
            <div className="bg-white border-[6px] border-pink-50 rounded-[3.5rem] p-8 shadow-2xl shadow-pink-100/20 space-y-8">
              <div className="space-y-4">
                <div className="relative group">
                   <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                     <svg className="w-4 h-4 text-slate-300 group-focus-within:text-pink-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                   </div>
                   <input type="password" value={manualApiKey} onChange={e => setManualApiKey(e.target.value)} placeholder="Enter API Key" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-mono outline-none focus:border-pink-300 focus:bg-white transition-all" />
                </div>
                
                <select value={model} onChange={e => setModel(e.target.value as AppModel)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-600 outline-none hover:border-slate-200 transition-colors">
                  <option value={AppModel.PRO}>Gemini 3 Pro (大师画质)</option>
                  <option value={AppModel.FLASH}>Gemini 2.5 Flash (疾速渲染)</option>
                </select>

                <div className="grid grid-cols-5 gap-2">
                  {RATIOS.map(r => (
                    <button key={r.id} onClick={() => setSelectedRatio(r.id)} className={`py-2 rounded-xl text-[10px] font-black border-2 transition-all ${selectedRatio === r.id ? 'bg-pink-400 border-pink-400 text-white shadow-lg shadow-pink-200' : 'bg-white border-slate-100 text-slate-400 hover:border-pink-100'}`}>{r.label}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ImageUploader label="肖像特征" onUpload={setCharacterImg} className="h-32" />
                <ImageUploader label="构图参考" onUpload={setReferenceImg} className="h-32" />
              </div>

              <button onClick={handleGenerate} disabled={isGenerating} className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] transition-all ${isGenerating ? 'bg-slate-100 text-slate-300' : 'bg-pink-400 text-white shadow-2xl hover:shadow-pink-300/50 hover:scale-[1.02] active:scale-95'}`}>
                {isGenerating ? status : "启动全自动视觉创作 🎬"}
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[600px]">
            {isGenerating && status && (
              <div className="sticky top-8 z-50 mb-10 bg-white/90 backdrop-blur-2xl border-4 border-pink-100 rounded-[2.5rem] p-6 shadow-2xl shadow-pink-100/50 flex items-center justify-between animate-in slide-in-from-top-4">
                <div className="flex items-center gap-5">
                  <div className="w-10 h-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
                  <div>
                    <span className="block text-xs font-black text-pink-400 uppercase tracking-widest">Processing</span>
                    <span className="text-sm font-bold text-slate-700">{status}</span>
                  </div>
                </div>
              </div>
            )}

            {!isGenerating && history.length === 0 && (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white/60 border-[6px] border-dashed border-slate-100 rounded-[4.5rem] text-center p-20 animate-in fade-in duration-1000">
                <div className="w-24 h-24 bg-pink-50 rounded-full flex items-center justify-center text-5xl mb-8 animate-pulse">✨</div>
                <h3 className="text-2xl font-black text-slate-800">构建美的瞬间</h3>
                <p className="text-slate-400 text-sm mt-3 max-w-sm mx-auto leading-relaxed">我们将使用 Pro 级模型深度分析参考图的景别与光影，并为您每一张高清切片进行 HD 重塑。</p>
              </div>
            )}

            <div className="space-y-24">
              {history.map(item => (
                <div key={item.id} className="space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  {/* 网格概览卡片 */}
                  <div className="bg-white border-[8px] border-white rounded-[4.5rem] overflow-hidden shadow-2xl shadow-slate-200/50 flex flex-col xl:flex-row">
                    <div className="xl:w-[480px] shrink-0 bg-slate-50 flex items-center justify-center relative group overflow-hidden">
                      <img src={item.fullImage} className="w-full h-full object-contain cursor-zoom-in transition-transform duration-700 group-hover:scale-105" onClick={() => setPreviewImage(item.fullImage)} />
                      <div className="absolute top-8 left-8 px-4 py-2 bg-white/80 backdrop-blur-md rounded-2xl text-[9px] font-black text-slate-500 uppercase tracking-widest border border-white">
                        Grid Master Analysis
                      </div>
                    </div>
                    <div className="flex-1 p-12 flex flex-col justify-between bg-white relative">
                      <div>
                        <div className="flex items-center gap-4 mb-8">
                          <span className="px-5 py-2 bg-slate-900 text-white text-[10px] font-black rounded-full uppercase tracking-[0.2em]">
                            {item.gridType} Mode
                          </span>
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{new Date(item.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <h4 className="text-[10px] font-black text-pink-400 uppercase tracking-[0.3em] mb-4">Director's Optimized Script</h4>
                        <div className="p-8 bg-slate-50 rounded-[2.5rem] text-[10px] text-slate-400 font-bold leading-relaxed italic border border-slate-100 max-h-[320px] overflow-y-auto custom-scrollbar">
                          {item.prompt.split('\n').map((line, i) => <div key={i} className="mb-3 last:mb-0 border-l-4 border-pink-100 pl-4 py-1">{line}</div>)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-10">
                        <button onClick={() => downloadImage(item.fullImage, 'Grid_Master')} className="px-10 py-5 bg-slate-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95">下载全景分镜</button>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black text-pink-300 uppercase tracking-[0.2em]">Status</span>
                          <span className="text-sm font-bold text-slate-800">
                             {item.upscaledIndices.length === item.slices.length ? "✓ 全部重塑完成" : `⟳ 正在生成中 ${item.upscaledIndices.length}/${item.slices.length}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 切片展示区 */}
                  <div className={`grid gap-12 ${item.gridType === 'single' ? 'grid-cols-1 max-w-2xl mx-auto' : item.gridType === '4-grid' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {item.slices.map((slice, i) => (
                      <div key={i} className="group relative bg-white border-[10px] border-white shadow-2xl rounded-[4rem] overflow-hidden transition-all hover:scale-[1.03] hover:-translate-y-2">
                        <div className="aspect-[3/4] bg-slate-50 relative overflow-hidden">
                          <img src={slice} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                          
                          {/* 悬浮覆盖层 */}
                          <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-center p-10 gap-5 backdrop-blur-sm">
                            <button onClick={() => downloadImage(slice, `Shot_${i+1}_HD`)} className="w-full py-5 bg-white text-slate-900 text-[10px] font-black rounded-3xl uppercase tracking-widest shadow-xl hover:bg-pink-400 hover:text-white transition-all">
                              保存 2K 高清肖像
                            </button>
                            <div className="flex gap-3 w-full">
                              <button onClick={() => setPreviewImage(slice)} className="flex-1 py-4 bg-slate-700 text-white text-[9px] font-black rounded-2xl uppercase tracking-widest hover:bg-slate-600">预览全图</button>
                              <button onClick={() => manualUpscale(item.id, i)} className="flex-1 py-4 bg-pink-500 text-white text-[9px] font-black rounded-2xl uppercase tracking-widest hover:bg-pink-600">重新渲染</button>
                            </div>
                          </div>

                          {/* 精致标签 */}
                          <div className="absolute top-8 left-8 flex items-center gap-2">
                            {item.upscaledIndices.includes(i) ? (
                              <div className="bg-emerald-500 text-white text-[9px] font-black px-5 py-2 rounded-full shadow-lg shadow-emerald-500/30 border-2 border-white animate-in zoom-in-50">
                                2K HD READY
                              </div>
                            ) : (
                              <div className="bg-pink-400 text-white text-[9px] font-black px-5 py-2 rounded-full shadow-lg border-2 border-white flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></div>
                                RENDER PENDING
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="p-8 bg-white flex items-center justify-between border-t border-slate-50">
                          <div>
                            <span className="block text-[12px] font-black text-slate-800 uppercase tracking-[0.4em]">SHOT {i + 1}</span>
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1 block">Master Portrait</span>
                          </div>
                          <button onClick={() => downloadImage(slice, `Shot_${i+1}`)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-pink-50 text-pink-400 hover:bg-pink-400 hover:text-white transition-all group/btn">
                            <svg className="w-6 h-6 transition-transform group-active/btn:translate-y-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
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
