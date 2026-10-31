import React from 'react';
import { Fingerprint } from 'lucide-react';
export default function VendorKycPage() {
  return (
    <div className="card p-8">
      <div className="flex items-center gap-3 mb-4"><Fingerprint className="w-6 h-6 text-[#4F46E5]" /><h1 className="text-xl font-bold">KYC Verification</h1></div>
      <p className="text-slate-400">KYC document upload — implementation pending.</p>
    </div>
  );
}
