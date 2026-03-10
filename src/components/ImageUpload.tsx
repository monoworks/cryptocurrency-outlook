'use client';

import { useState, useRef, useCallback } from 'react';

interface Props {
  onImageSelect: (base64: string | null) => void;
  imageBase64: string | null;
}

export default function ImageUpload({ onImageSelect, imageBase64 }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix to get base64
      const base64 = result.split(',')[1];
      onImageSelect(base64);
    };
    reader.readAsDataURL(file);
  }, [onImageSelect]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-bold text-white mb-3">チャート画像 (オプション)</h2>

      {imageBase64 ? (
        <div className="relative">
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt="Uploaded chart"
            className="rounded max-h-48 w-full object-contain bg-gray-900"
          />
          <button
            onClick={() => onImageSelect(null)}
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
          >
            削除
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500'
          }`}
        >
          <p className="text-gray-400 text-sm">
            チャート画像をドラッグ&ドロップ<br />
            またはクリックして選択
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
          />
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">
        AI分析設定でAPIキーを設定すると、AIがチャート画像を分析します。
      </p>
    </div>
  );
}
