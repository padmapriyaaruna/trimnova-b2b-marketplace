import React from 'react';
import { ClipboardList } from 'lucide-react';

export default function CustomerOrdersPage() {
  return (
    <div className="card p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <ClipboardList className="w-6 h-6 text-[#4F46E5]" />
        <h1 className="text-xl font-bold text-slate-900">My Orders</h1>
      </div>
      <p className="text-slate-400">Order list — implementation pending.</p>
    </div>
  );
}
