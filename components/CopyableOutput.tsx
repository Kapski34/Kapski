import React, { useState } from 'react';

interface CopyableOutputProps {
  label: string;
  content: string;
  height?: string;
  action?: React.ReactNode;
}

export const CopyableOutput: React.FC<CopyableOutputProps> = ({ label, content, height = 'h-64', action }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full flex flex-col">
        <div className="flex justify-between items-center mb-2">
            <h4 className="text-md font-semibold text-gray-300">{label}</h4>
            <div className="flex items-center gap-2">
              {action}
              <button
                  onClick={handleCopy}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-cyan-300 ${!content ? 'hidden' : ''}`}
              >
                  {copied ? (
                      <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Skopiowano
                      </>
                  ) : (
                      <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Kopiuj
                      </>
                  )}
              </button>
            </div>
        </div>
      <textarea
        readOnly
        value={content}
        className={`w-full ${height} p-3 bg-slate-900/70 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm whitespace-pre-wrap focus:ring-2 focus:ring-cyan-400 focus:outline-none resize-y`}
        placeholder="Generowanie treści..."
      />
    </div>
  );
};