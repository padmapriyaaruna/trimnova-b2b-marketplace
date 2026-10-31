import React from 'react';
import { Sliders } from 'lucide-react';
export default function PlatformConfig() {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 mb-4"><Sliders className="w-6 h-6 text-[#4F46E5]" /><h1 className="text-xl font-bold">Platform Configuration</h1></div>
      <p className="text-slate-400">Global platform settings — implementation pending.</p>
    </div>
  );
}
