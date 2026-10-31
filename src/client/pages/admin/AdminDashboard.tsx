import React from 'react';
import { LayoutDashboard } from 'lucide-react';
export default function AdminDashboard() {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 mb-4"><LayoutDashboard className="w-6 h-6 text-[#4F46E5]" /><h1 className="text-xl font-bold">Admin Dashboard</h1></div>
      <p className="text-slate-400">Platform overview — implementation pending.</p>
    </div>
  );
}
