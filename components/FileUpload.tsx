import React from 'react';

interface FileUploadProps {
  id: string;
  label: string;
  accept: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileName: string | undefined;
  icon: React.ReactNode;
  helpText?: React.ReactNode;
  multiple?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ id, label, accept, onChange, fileName, icon, helpText, multiple = false }) => {
  const defaultHelpText = `Akceptowane pliki: ${accept.replace(/\./g, ' ').replace(/image\//g, '').toUpperCase()}`;
  
  return (
    <div>
      <label htmlFor={id} className="cursor-pointer">
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 hover:border-cyan-400 rounded-xl p-6 transition-all duration-300 bg-slate-800/60 hover:bg-cyan-900/30">
          {icon}
          <p className="mt-3 font-semibold text-cyan-300">{label}</p>
          <p className="mt-1 text-sm text-gray-500">
            {helpText || defaultHelpText}
          </p>
        </div>
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={onChange}
        className="hidden"
        multiple={multiple}
      />
      {fileName && (
        <div className="mt-3 text-center bg-slate-900/50 py-2 px-4 rounded-md">
            <p className="text-sm text-gray-300 truncate">
                Wybrano: <span className="font-medium text-cyan-400">{fileName}</span>
            </p>
        </div>
      )}
    </div>
  );
};