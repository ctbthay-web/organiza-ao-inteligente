
import React from 'react';

const ProcessingAnimation: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-indigo-200 rounded-full animate-pulse"></div>
        <div className="absolute inset-0 border-t-4 border-indigo-600 rounded-full animate-spin"></div>
      </div>
      <div className="text-center">
        <h3 className="text-xl font-semibold text-slate-800">Organizando seu relatório...</h3>
        <p className="text-slate-500 text-sm">A inteligência artificial está lendo e estruturando os dados para você.</p>
      </div>
    </div>
  );
};

export default ProcessingAnimation;
