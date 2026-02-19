import React, { useRef, useState } from 'react';
import { ImageFile } from '../types';

interface ImageUploadProps {
  label: string;
  image: ImageFile | null;
  onImageChange: (image: ImageFile | null) => void;
  id: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ label, image, onImageChange, id }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    // Basic type validation
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Split to get pure base64 for API
      const base64 = result.split(',')[1];
      
      onImageChange({
        file,
        preview: result,
        base64,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processFile(file);
          e.preventDefault(); 
        }
        break;
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onImageChange(null);
  };

  return (
    <div className="flex flex-col space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label} <span className="text-slate-400 font-normal">(Optional)</span>
      </label>
      
      {!image ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          tabIndex={0}
          className={`cursor-pointer group relative flex flex-col items-center justify-center w-full h-48 rounded-lg border-2 border-dashed transition-all duration-200 outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            isDragging 
              ? 'border-indigo-500 bg-indigo-50' 
              : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-blue-400'
          }`}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
            <svg className={`w-8 h-8 mb-4 transition-colors ${isDragging ? 'text-indigo-500' : 'text-slate-400 group-hover:text-blue-500'}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.017 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
            </svg>
            <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Click to upload</span>, drag & drop, or paste screenshot</p>
            <p className="text-xs text-slate-400">PNG, JPG, JPEG (Ctrl+V to paste)</p>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-200 shadow-sm group">
          <img 
            src={image.preview} 
            alt={`${label} Preview`} 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={handleRemove}
              className="bg-red-500 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-600 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      )}
      
      <input 
        ref={fileInputRef}
        id={id} 
        type="file" 
        accept="image/*" 
        className="hidden" 
        onChange={handleFileChange}
      />
    </div>
  );
};

export default ImageUpload;