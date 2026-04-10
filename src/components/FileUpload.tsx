"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  onFileLoaded: (buffer: ArrayBuffer, fileName: string) => void;
  isLoading: boolean;
  fileName?: string;
}

export default function FileUpload({ onFileLoaded, isLoading, fileName }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        onFileLoaded(buffer, file.name);
      };
      reader.readAsArrayBuffer(file);
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      className={`
        relative flex items-center justify-center rounded-md border border-dashed
        px-4 py-3 transition-colors cursor-pointer
        ${isDragOver
          ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
          : fileName
            ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-700"
            : "border-zinc-300 bg-zinc-50/50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/30 dark:hover:border-zinc-600"}
      `}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />
      <div className="flex items-center gap-2.5 text-xs pointer-events-none">
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-zinc-500">Processing...</span>
          </>
        ) : fileName ? (
          <>
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[240px]">{fileName}</span>
            <span className="text-zinc-400 dark:text-zinc-500">(click to replace)</span>
          </>
        ) : (
          <>
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-zinc-500 dark:text-zinc-400">
              Drop Excel/CSV file or <span className="text-blue-600 dark:text-blue-400 font-medium">browse</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
