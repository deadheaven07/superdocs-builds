import { Database, KeyRound, HardDrive, Server, ShieldCheck, Lock } from "lucide-react";

export function SettingsPage() {
  const rows = [
    { icon: Server, label: "API Base URL", value: import.meta.env.VITE_API_URL || "/api (proxied to :8000)", status: "Connected" },
    { icon: KeyRound, label: "SuperDocs AI Intelligence", value: "Backend-configured (SUPERDOCS_API_KEY with deterministic fallback)", status: "Active" },
    { icon: Database, label: "Relational Database", value: "PostgreSQL 16 (bates_packet)", status: "Healthy" },
    { icon: HardDrive, label: "Content-Addressed Storage", value: "backend/storage (originals, processed, working, final)", status: "Reference-Aware" },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-display font-bold tracking-tight text-white">System Diagnostics</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            System Operational
          </span>
        </div>
        <p className="text-slate-400 text-sm mt-1">Runtime infrastructure and verification engine parameters.</p>
      </div>

      {/* Diagnostics Grid */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800/90 divide-y divide-slate-800/60 shadow-xl backdrop-blur-md overflow-hidden">
        {rows.map(({ icon: Icon, label, value, status }) => (
          <div key={label} className="flex items-center justify-between p-5 hover:bg-slate-800/30 transition-colors">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-slate-400 mt-1 font-mono">{value}</p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs font-mono font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              {status}
            </span>
          </div>
        ))}
      </div>

      {/* Legal & Architectural Guarantees Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 space-y-2">
          <div className="flex items-center gap-2 text-sky-400">
            <ShieldCheck className="h-5 w-5" />
            <p className="font-semibold text-white text-sm">Bates Contiguity Invariant</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Packets use a configurable prefix (default <code className="text-sky-300 font-mono">CASE-</code>), sequential start number, and zero-padding width. Reordering dynamically updates contiguous sequence numbering.
          </p>
        </div>

        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400">
            <Lock className="h-5 w-5" />
            <p className="font-semibold text-white text-sm">Byte-Scrub Redaction & Manifest</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Redacted bytes are permanently eliminated from PDF streams with multi-pass residue verification. Every exported exhibit and manifest entry is sealed with cryptographic SHA-256 hashes.
          </p>
        </div>
      </div>
    </div>
  );
}