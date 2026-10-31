import React from 'react';
import { BarChart2 } from 'lucide-react';
export default function MarginManager() {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 mb-4"><BarChart2 className="w-6 h-6 text-[#4F46E5]" /><h1 className="text-xl font-bold">Margin Manager</h1></div>
      <p className="text-slate-400">Platform margin controls — implementation pending.</p>
    </div>
  );
}
