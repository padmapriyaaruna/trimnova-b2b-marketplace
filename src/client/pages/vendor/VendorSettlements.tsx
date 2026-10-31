import React from 'react';
import { DollarSign } from 'lucide-react';
export default function VendorSettlements() {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 mb-4"><DollarSign className="w-6 h-6 text-[#4F46E5]" /><h1 className="text-xl font-bold">Settlements</h1></div>
      <p className="text-slate-400">Settlement statements — implementation pending.</p>
    </div>
  );
}
