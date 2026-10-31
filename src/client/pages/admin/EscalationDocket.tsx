import React from 'react';
import { AlertOctagon } from 'lucide-react';
export default function EscalationDocket() {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 mb-4"><AlertOctagon className="w-6 h-6 text-[#EF4444]" /><h1 className="text-xl font-bold">Escalation Docket</h1></div>
      <p className="text-slate-400">Escalation management — implementation pending.</p>
    </div>
  );
}
