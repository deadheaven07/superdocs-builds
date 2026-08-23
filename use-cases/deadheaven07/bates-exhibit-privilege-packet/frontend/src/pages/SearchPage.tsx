import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Loader2, AlertCircle, FileText, ExternalLink } from "lucide-react";
import { usePackets } from "@/hooks/usePackets";
import { useSearchPacket } from "@/hooks/useSearch";

export function SearchPage() {
  const [packetId, setPacketId] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const { data: packets, isLoading: packetsLoading } = usePackets();
  const { data: searchResult, isLoading, error, refetch } = useSearchPacket(packetId, submittedQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!packetId || !query.trim()) return;
    setSubmittedQuery(query);
    refetch();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-display font-bold tracking-tight text-white">Search</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            E-Discovery Intelligence
          </span>
        </div>
        <p className="text-slate-400 text-sm mt-1">Search documents, extracted text, and Bates numbers within a packet.</p>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={packetId}
            onChange={(e) => setPacketId(e.target.value)}
            className="px-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-slate-100 text-sm font-medium focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none sm:w-64"
          >
            <option value="">Select packet...</option>
            {packets?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filenames, extracted content, or Bates numbers..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!packetId || !query.trim() || isLoading}
            className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium text-sm rounded-xl shadow-glow-sm hover:shadow-glow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>
      </form>

      {packetsLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
          <span>Loading packets...</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-5 backdrop-blur-md flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
          <span className="text-sm text-rose-200">Search failed: {error.message}</span>
        </div>
      )}

      {submittedQuery && !isLoading && !error && searchResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-mono text-slate-400">
              Found <span className="font-bold text-sky-400">{searchResult.total_results}</span> match(es) for "<span className="text-white font-medium">{searchResult.query}</span>"
            </p>
          </div>

          <div className="space-y-3">
            {searchResult.results.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <Search className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <p className="text-slate-300 font-medium">No matching documents found</p>
                <p className="text-xs text-slate-500 mt-1">Try another keyword, phrase, or check OCR processing status.</p>
              </div>
            ) : (
              searchResult.results.map((result) => (
                <div key={result.document_id} className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-md hover:border-slate-700 transition-all space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/packets/${packetId}`}
                        className="font-semibold text-base text-white hover:text-sky-400 transition-colors flex items-center gap-2 group"
                      >
                        <FileText className="h-4 w-4 text-sky-400" />
                        <span className="truncate">{result.document_name}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-slate-500 group-hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded-md font-mono">{result.document_type}</span>
                        <span>•</span>
                        <span>{result.page_count} pages</span>
                        <span>•</span>
                        <span className="capitalize">{result.status.replace("_", " ")}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 flex-shrink-0">
                      {result.matched_fields.map((field) => (
                        <span key={field} className="px-2 py-0.5 text-xs font-mono bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-md">
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>

                  {result.snippets.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-slate-800/60">
                      {result.snippets.slice(0, 3).map((s, i) => (
                        <div key={i} className="text-xs text-slate-300 bg-slate-950/60 rounded-xl p-3 border border-slate-800/60 font-mono flex items-start gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[10px] font-bold shrink-0">
                            Page {s.page_number}
                          </span>
                          <span className="text-slate-300 leading-relaxed font-sans">{s.snippet}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}