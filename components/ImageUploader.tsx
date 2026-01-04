
import React, { useState, useRef } from 'react';

interface ImageUploaderProps {
  label: string;
  onUpload: (base64: string) => void;
  className?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ label, onUpload, className }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreview(result);
      onUpload(result);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div 
      className={`relative group cursor-pointer border-4 border-dashed rounded-[2rem] overflow-hidden transition-all duration-500 flex flex-col items-center justify-center min-h-[160px] ${
        isDragging ? 'border-pink-300 bg-pink-50 scale-[0.98]' : 'border-slate-100 hover:border-pink-200 bg-white'
      } ${className}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={onChange}
        accept="image/*"
      />
      
      {preview ? (
        <img src={preview} alt="预览" className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-500" />
      ) : (
        <div className="flex flex-col items-center p-4 text-center">
          <div className="w-12 h-12 mb-3 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 group-hover:text-pink-400 group-hover:bg-pink-50 transition-all duration-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-[11px] font-black text-slate-400 group-hover:text-pink-400 transition-colors uppercase tracking-widest">{label}</p>
        </div>
      )}
      
      {preview && (
        <div className="absolute inset-0 bg-pink-400/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <p className="text-white text-[10px] font-black uppercase tracking-[0.2em] scale-110">更换图片 ✨</p>
        </div>
      )}
    </div>
  );
};
