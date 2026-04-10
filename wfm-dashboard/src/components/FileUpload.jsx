import { useCallback } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function FileUpload({ onDataLoaded }) {
  const handleFile = useCallback((file) => {
    const name = file.name.toLowerCase();

    if (name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => onDataLoaded(results.data, file.name),
        error: (err) => alert(`CSV parse error: ${err.message}`),
      });
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet);
          onDataLoaded(rows, file.name);
        } catch (err) {
          alert(`Excel parse error: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('Please upload a CSV or Excel file.');
    }
  }, [onDataLoaded]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center
                 hover:border-primary/60 transition-colors cursor-pointer bg-bg-card/50"
    >
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={onSelect}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <div>
          <p className="text-text-main font-semibold text-lg">Drop your file here or click to browse</p>
          <p className="text-text-sub text-sm mt-1">CSV or Excel with a <code className="bg-bg-surface px-1.5 py-0.5 rounded text-primary-light text-xs">created_at</code> column</p>
        </div>
        <div className="flex items-center gap-2 text-text-muted text-xs mt-2">
          <FileSpreadsheet className="w-4 h-4" />
          <span>Supports .csv, .xlsx, .xls</span>
        </div>
      </label>
    </div>
  );
}
