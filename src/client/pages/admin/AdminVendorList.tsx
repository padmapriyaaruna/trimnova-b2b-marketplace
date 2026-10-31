import React from 'react';
import { Users } from 'lucide-react';
export default function AdminVendorList() {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 mb-4"><Users className="w-6 h-6 text-[#4F46E5]" /><h1 className="text-xl font-bold">Vendor Management</h1></div>
      <p className="text-slate-400">Vendor directory and controls — implementation pending.</p>
    </div>
  );
}
