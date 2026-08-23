import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Upload, Download, ArrowUpDown, Search, Shield, FileText, Plus,
  Loader2, AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, Send, Check, X, XCircle,
  ArrowUp, ArrowDown, Trash2,
} from "lucide-react";
import { clsx } from "clsx";
import { usePacket } from "@/hooks/usePackets";
import {
  useDocuments, useUploadDocuments, useDeleteDocument, useReorderDocument, useDownloadDocument,
} from "@/hooks/useDocuments";
import { useProcessingStatus, useStartProcessing, useRetryDocument } from "@/hooks/useProcessing";
import { useAssignBates, useBatesPreview } from "@/hooks/useBates";
import { useBuildPacket, useDownloadPacket, useValidatePacket, useVerifyPacket, useManifest } from "@/hooks/useExports";
import {
  useDetectRedactions, useRedactionCandidates, useApproveRedaction,
  useApplyRedaction, useApplyAllRedactions,
} from "@/hooks/useRedactions";
import { usePrivilegeLog, usePrivilegeDecisions, useMarkPrivilege } from "@/hooks/usePrivilege";
import { useAuditTrail } from "@/hooks/useAudit";
import {
  useRequestAIAnalysis, useAnalysisStatus, useApproveAIChanges, useContinueAIJob,
} from "@/hooks/useReview";
import { useToast } from "@/components/ui/use-toast";
import { DocumentPdfViewer } from "@/components/DocumentPdfViewer";
import type {
  DocumentListResponse, PrivilegeDecision, PrivilegeStatus, PrivilegeCategory, RedactionCandidate,
} from "@/types/api";

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  processing: "bg-sky-500/10 text-sky-400 border border-sky-500/30",
  ocr: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  ai_analysis: "bg-purple-500/10 text-purple-400 border border-purple-500/30",
  waiting_review: "bg-orange-500/10 text-orange-400 border border-orange-500/30",
  queued: "bg-slate-800 text-slate-400 border border-slate-700",
  failed: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
  bates_assigned: "bg-teal-500/10 text-teal-400 border border-teal-500/30",
  assembling: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30",
  approved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
};

const privilegeColors: Record<string, string> = {
  privileged: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
  not_privileged: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  pending: "bg-slate-800 text-slate-400 border border-slate-700",
};

const redactionStatusColors: Record<string, string> = {
  proposed: "bg-slate-800 text-slate-400 border border-slate-700",
  pending_approval: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  approved: "bg-sky-500/10 text-sky-400 border border-sky-500/30",
  rejected: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
  applied: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  verified: "bg-teal-500/10 text-teal-400 border border-teal-500/30",
  failed: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
};

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-8 w-8 animate-spin text-sky-400 mb-3" />
      <span className="text-xs font-mono">{message}</span>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-5 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-5 w-5 text-rose-400" />
        <span className="text-sm font-semibold text-rose-200">Operation Error</span>
      </div>
      <p className="text-xs text-rose-300 mt-2 font-mono">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-colors"
        >
          Retry Action
        </button>
      )}
    </div>
  );
}

const stripHtml = (html: string | null) =>
  (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// ---------- AI Changes Panel ----------

function AiChangesPanel({ packetId, selectedDoc }: { packetId: string; selectedDoc: DocumentListResponse }) {
  const [instruction, setInstruction] = useState(
    "Review this document for legal relevance, summarize key points, and propose any edits needed for exhibit inclusion."
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const { toast } = useToast();

  const requestAIAnalysis = useRequestAIAnalysis();
  const approveAIChanges = useApproveAIChanges();
  const continueAIJob = useContinueAIJob();
  const { data: status, isLoading: statusLoading } = useAnalysisStatus(packetId, selectedDoc.id, jobId ?? "");

  const handleRequest = async () => {
    try {
      const res = await requestAIAnalysis.mutateAsync({
        packetId,
        documentId: selectedDoc.id,
        data: { instruction, approval_mode: "ask_every_time", model_tier: "core" },
      });
      setJobId(res.job_id);
      toast({ title: "AI analysis started", description: `Job ${res.job_id}` });
    } catch (err: any) {
      toast({ title: "Failed to start AI analysis", description: err?.message, variant: "destructive" });
    }
  };

  const handleApprove = async (approved: boolean) => {
    if (!jobId || !status?.changes) return;
    try {
      await approveAIChanges.mutateAsync({
        packetId,
        documentId: selectedDoc.id,
        data: { job_id: jobId, approved, changes: status.changes },
      });
      toast({ title: approved ? "Changes approved" : "Changes rejected" });
      setJobId(null);
    } catch (err: any) {
      toast({ title: "Failed to submit decision", description: err?.message, variant: "destructive" });
    }
  };

  const handleContinue = async (continueJob: boolean) => {
    if (!jobId) return;
    try {
      await continueAIJob.mutateAsync({
        packetId,
        documentId: selectedDoc.id,
        data: { job_id: jobId, continue_job: continueJob },
      });
      toast({ title: continueJob ? "Job continued" : "Job stopped" });
      setJobId(null);
    } catch (err: any) {
      toast({ title: "Failed to continue job", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">AI Review: {selectedDoc.filename}</h2>
        <span className={clsx("px-2 py-1 rounded text-xs", statusColors[selectedDoc.status] ?? "bg-gray-100 text-gray-700")}>
          {selectedDoc.status.replace("_", " ")}
        </span>
      </div>

      {!jobId ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Instruction for AI Analysis</label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <Button onClick={handleRequest} disabled={requestAIAnalysis.isPending}>
            {requestAIAnalysis.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Request AI Analysis
          </Button>
        </div>
      ) : statusLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          <span className="ml-3 text-gray-600">Polling job {jobId}...</span>
        </div>
      ) : status?.status === "awaiting_approval" && status.changes && status.changes.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-700">
            {status.changes.length} proposed change(s) awaiting approval
            {status.awaiting_kind === "continue" ? " (continue prompt)" : ""}
          </p>
          {status.changes.map((change) => (
            <div key={change.change_id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="px-1.5 py-0.5 text-xs bg-purple-50 text-purple-700 rounded">{change.operation}</span>
                <span className="text-xs text-gray-400">{change.change_id}</span>
              </div>
              {change.ai_explanation && (
                <p className="text-sm text-gray-600 mt-2">{change.ai_explanation}</p>
              )}
              {change.old_html && (
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-medium text-red-600">Before:</span> {stripHtml(change.old_html).slice(0, 300)}
                </p>
              )}
              {change.new_html && (
                <p className="text-xs text-gray-500 mt-1">
                  <span className="font-medium text-green-600">After:</span> {stripHtml(change.new_html).slice(0, 300)}
                </p>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => handleApprove(true)} disabled={approveAIChanges.isPending}>
              <Check className="h-4 w-4" /> Approve All
            </Button>
            <Button variant="outline" onClick={() => handleApprove(false)} disabled={approveAIChanges.isPending}>
              <X className="h-4 w-4" /> Reject All
            </Button>
          </div>
        </div>
      ) : status?.status === "awaiting_approval" && status.continue_prompt ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">{String(status.continue_prompt)}</p>
          <div className="flex gap-2">
            <Button onClick={() => handleContinue(true)} disabled={continueAIJob.isPending}>
              <Check className="h-4 w-4" /> Continue
            </Button>
            <Button variant="outline" onClick={() => handleContinue(false)} disabled={continueAIJob.isPending}>
              <X className="h-4 w-4" /> Stop
            </Button>
          </div>
        </div>
      ) : status?.error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-800">{status.error}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Job status: <span className="font-medium">{status?.status ?? "unknown"}</span></p>
          {status?.result && (
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto max-h-64">
              {JSON.stringify(status.result, null, 2).slice(0, 2000)}
            </pre>
          )}
          <Button variant="outline" onClick={() => setJobId(null)}>
            <XCircle className="h-4 w-4" /> Cancel Job
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Privilege Panel ----------

function PrivilegeRow({
  doc, decision, onSave, isSaving,
}: {
  doc: DocumentListResponse;
  decision?: PrivilegeDecision;
  onSave: (docId: string, data: { status: PrivilegeStatus; category?: PrivilegeCategory; reason?: string }) => void;
  isSaving: boolean;
}) {
  const [status, setStatus] = useState<PrivilegeStatus>(decision?.status ?? "pending");
  const [category, setCategory] = useState<PrivilegeCategory | "">(decision?.category ?? "");
  const [reason, setReason] = useState(decision?.reason ?? "");

  const invalid = status === "privileged" && !reason.trim();

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{doc.filename}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span className={clsx("px-1.5 py-0.5 rounded", privilegeColors[status])}>{status.replace("_", " ")}</span>
            {doc.bates_range && <span className="font-mono">{doc.bates_range}</span>}
            {decision?.reviewer && <span>by {decision.reviewer}</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as PrivilegeStatus)}
          className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-primary-500"
        >
          <option value="pending">Pending</option>
          <option value="privileged">Privileged</option>
          <option value="not_privileged">Not Privileged</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as PrivilegeCategory | "")}
          disabled={status !== "privileged"}
          className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        >
          <option value="">Category...</option>
          <option value="attorney_client">Attorney-Client</option>
          <option value="work_product">Work Product</option>
          <option value="other">Other</option>
        </select>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={status !== "privileged"}
          placeholder={status === "privileged" ? "Reason (required)" : "Reason"}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        />
      </div>
      {invalid && <p className="text-xs text-red-600 mt-2">Reason is required for privileged documents.</p>}
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={isSaving || invalid || (status === "pending" && !decision)}
          onClick={() => onSave(doc.id, { status, category: category || undefined, reason: reason || undefined })}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save Decision
        </Button>
      </div>
    </div>
  );
}

function PrivilegePanel({ packetId, documents }: { packetId: string; documents?: DocumentListResponse[] }) {
  const [reviewer, setReviewer] = useState("reviewer");
  const { data: decisions } = usePrivilegeDecisions(packetId);
  const markPrivilege = useMarkPrivilege();
  const { toast } = useToast();

  const decisionsByDoc = useMemo(() => {
    const map: Record<string, PrivilegeDecision> = {};
    (decisions ?? []).forEach((d: PrivilegeDecision) => { map[d.document_id] = d; });
    return map;
  }, [decisions]);

  const handleSave = async (docId: string, data: { status: PrivilegeStatus; category?: PrivilegeCategory; reason?: string }) => {
    try {
      await markPrivilege.mutateAsync({ packetId, documentId: docId, data: { ...data, reviewer } });
      toast({ title: "Privilege decision saved" });
    } catch (err: any) {
      toast({ title: "Failed to save decision", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="bg-white rounded-lg shadow-sm border p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Privilege Marking</h2>
          <p className="text-sm text-gray-500 mt-1">Mark documents as privileged with category and reason. Privileged documents appear in the privilege log.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Reviewer:</label>
          <input
            type="text"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-40 focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      {!documents || documents.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
          No documents to mark. Upload documents first.
        </div>
      ) : (
        documents.map((doc) => (
          <PrivilegeRow
            key={doc.id}
            doc={doc}
            decision={decisionsByDoc[doc.id]}
            onSave={handleSave}
            isSaving={markPrivilege.isPending}
          />
        ))
      )}
    </div>
  );
}

// ---------- Redactions Panel ----------

function RedactionsPanel({ packetId, candidates }: { packetId: string; candidates?: RedactionCandidate[] }) {
  const [approver, setApprover] = useState("reviewer");
  const { toast } = useToast();
  const approveRedaction = useApproveRedaction();
  const applyRedaction = useApplyRedaction();
  const applyAll = useApplyAllRedactions();

  const approvedDocIds = useMemo(
    () => [...new Set((candidates ?? []).filter((c) => c.status === "approved").map((c) => c.document_id))],
    [candidates]
  );

  const handleApprove = async (candidate: RedactionCandidate, approved: boolean) => {
    try {
      await approveRedaction.mutateAsync({
        packetId,
        redactionId: candidate.id,
        data: { status: approved ? "approved" : "rejected", approver },
      });
      toast({ title: approved ? "Candidate approved" : "Candidate rejected" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleApply = async (candidate: RedactionCandidate) => {
    try {
      await applyRedaction.mutateAsync({ packetId, redactionId: candidate.id });
      toast({ title: "Redaction applied", description: "Applied and verified." });
    } catch (err: any) {
      toast({ title: "Apply failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleApplyAll = async () => {
    if (approvedDocIds.length === 0) return;
    try {
      const res = await applyAll.mutateAsync({ packetId, data: { document_ids: approvedDocIds } });
      const total = res.results?.reduce((sum: number, r: any) => sum + (r.candidates_applied ?? 0), 0) ?? 0;
      toast({ title: "Redactions applied", description: `${total} candidate(s) applied across ${res.results?.length ?? 0} document(s).` });
    } catch (err: any) {
      toast({ title: "Apply failed", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="bg-white rounded-lg shadow-sm border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Redaction Candidates</h2>
          <p className="text-sm text-gray-500 mt-1">
            {candidates?.length ?? 0} candidate(s). Approve, reject, then apply redactions to documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Approver:</label>
          <input
            type="text"
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-32 focus:ring-2 focus:ring-primary-500"
          />
          <Button onClick={handleApplyAll} disabled={approvedDocIds.length === 0 || applyAll.isPending}>
            {applyAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Apply All Approved
          </Button>
        </div>
      </div>

      {!candidates || candidates.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
          No redaction candidates yet. Run "Detect Redactions" to scan for PII.
        </div>
      ) : (
        candidates.map((candidate) => (
          <div key={candidate.id} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{candidate.matched_text}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">{candidate.category}</span>
                  <span>{candidate.document_name}</span>
                  <span>Page {candidate.page_number}</span>
                  <span className={clsx("px-1.5 py-0.5 rounded", redactionStatusColors[candidate.status] ?? "bg-gray-100 text-gray-700")}>
                    {candidate.status.replace("_", " ")}
                  </span>
                  {candidate.proposed_by && (
                    <span className={clsx(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      candidate.proposed_by === "superdocs"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                    )}>
                      {candidate.proposed_by === "superdocs" ? "SuperDocs AI" : "Local Fallback"}
                    </span>
                  )}
                  {candidate.approval?.approver && <span>by {candidate.approval.approver}</span>}
                </div>
                {(candidate.context_before || candidate.context_after) && (
                  <p className="text-xs text-gray-500 mt-2">
                    {candidate.context_before && <span>…{candidate.context_before}</span>}
                    <span className="font-medium text-gray-700"> {candidate.matched_text} </span>
                    {candidate.context_after && <span>{candidate.context_after}…</span>}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {(candidate.status === "proposed" || candidate.status === "pending_approval") && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleApprove(candidate, true)} disabled={approveRedaction.isPending}>
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleApprove(candidate, false)} disabled={approveRedaction.isPending}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  </>
                )}
                {candidate.status === "approved" && (
                  <Button size="sm" onClick={() => handleApply(candidate)} disabled={applyRedaction.isPending}>
                    {applyRedaction.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Apply
                  </Button>
                )}
                {candidate.status === "applied" && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Applied
                    {candidate.approval?.verified_at && <span className="text-teal-600">• Verified</span>}
                  </span>
                )}
                {candidate.status === "rejected" && (
                  <span className="text-xs text-red-600 flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> Rejected
                  </span>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------- Audit Panel ----------

function AuditPanel({ packetId }: { packetId: string }) {
  const { data: trail, isLoading } = useAuditTrail(packetId);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h2 className="text-lg font-medium text-gray-900">Audit Trail</h2>
        <p className="text-sm text-gray-500 mt-1">{trail?.total_events ?? 0} event(s) recorded for this packet.</p>
      </div>
      {isLoading ? (
        <LoadingState message="Loading audit trail..." />
      ) : !trail || trail.events.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
          No audit events recorded yet.
        </div>
      ) : (
        trail.events.map((event) => (
          <div key={event.id} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-1.5 py-0.5 text-xs bg-primary-50 text-primary-700 rounded font-medium">
                    {event.event_type.replace(/_/g, " ")}
                  </span>
                  {event.user_id && <span className="text-xs text-gray-500">by {event.user_id}</span>}
                  {event.document_name && <span className="text-xs text-gray-500">{event.document_name}</span>}
                </div>
                {event.metadata && (
                  <pre className="text-xs bg-gray-50 border border-gray-100 rounded p-2 mt-2 overflow-x-auto">
                    {JSON.stringify(event.metadata, null, 2).slice(0, 500)}
                  </pre>
                )}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {new Date(event.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------- Main Workspace ----------

export function PacketWorkspace() {
  const { packetId = "" } = useParams();
  const [activeTab, setActiveTab] = useState("documents");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: packet, isLoading: packetLoading, error: packetError, refetch: refetchPacket } = usePacket(packetId);
  const { data: documents, isLoading: docsLoading, error: docsError, refetch: refetchDocs } = useDocuments(packetId);
  const { data: processingStatus, refetch: refetchProcessing } = useProcessingStatus(packetId);
  const { data: batesPreview } = useBatesPreview(packetId);
  const { data: manifest } = useManifest(packetId);
  const { data: redactionCandidates } = useRedactionCandidates(packetId);
  const { data: privilegeLog } = usePrivilegeLog(packetId);

  const uploadMutation = useUploadDocuments(packetId);
  const startProcessing = useStartProcessing();
  const retryDocument = useRetryDocument();
  const assignBates = useAssignBates();
  const buildPacket = useBuildPacket();
  const validatePacket = useValidatePacket();
  const verifyPacket = useVerifyPacket();
  const downloadPacket = useDownloadPacket(packetId);
  const detectRedactions = useDetectRedactions();
  const downloadDocument = useDownloadDocument(packetId);
  const reorderDocument = useReorderDocument(packetId);
  const deleteDocument = useDeleteDocument(packetId);

  const sortedDocs = useMemo(() => {
    const docs = [...(documents ?? [])];
    docs.sort((a, b) => a.display_order - b.display_order);
    return docs;
  }, [documents]);

  const selectedDoc = sortedDocs.find((d) => d.id === selectedDocId) ?? sortedDocs[0] ?? null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const result = await uploadMutation.mutateAsync(files);
      toast({
        title: "Documents uploaded",
        description: `${result.documents.length} document(s) uploaded and processed.`,
      });
      refetchDocs();
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message ?? "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleProcess = async () => {
    try {
      const result = await startProcessing.mutateAsync(packetId);
      toast({
        title: "Processing started",
        description: `${result.documents_queued?.length ?? 0} document(s) queued for processing.`,
      });
      refetchProcessing();
    } catch (err: any) {
      toast({ title: "Processing failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleAssignBates = async () => {
    try {
      await assignBates.mutateAsync(packetId);
      toast({ title: "Bates assigned", description: "Bates numbers assigned to all documents." });
      refetchDocs();
    } catch (err: any) {
      toast({ title: "Bates assignment failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleBuild = async () => {
    try {
      await validatePacket.mutateAsync(packetId);
      const result = await buildPacket.mutateAsync(packetId);
      toast({
        title: "Packet built",
        description: `${result.total_documents} documents, ${result.total_pages} pages (covers included).`,
      });
    } catch (err: any) {
      toast({ title: "Build failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleExport = async () => {
    try {
      const blob = await downloadPacket.mutateAsync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${packet?.name ?? "packet"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export started", description: "Packet download initiated." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleVerify = async () => {
    try {
      const result = await verifyPacket.mutateAsync(packetId);
      setVerifyResult(result);
      if (result.status === "VERIFIED") {
        toast({
          title: "Packet verified",
          description: `All ${result.checks.length} checks passed.`,
        });
      } else {
        const failed = result.checks.filter((c: any) => !c.passed);
        toast({
          title: "Verification failed",
          description: `${failed.length} check(s) failed.`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setVerifyResult(null);
      toast({ title: "Verification failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleDetectRedactions = async () => {
    try {
      const result = await detectRedactions.mutateAsync(packetId);
      toast({
        title: "Detection started",
        description: `${result.documents_queued ?? 0} document(s) queued for PII scan.`,
      });
    } catch (err: any) {
      toast({ title: "Detection failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleDownloadDocument = async (doc: DocumentListResponse) => {
    try {
      const blob = await downloadDocument.mutateAsync(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleMoveDocument = async (doc: DocumentListResponse, direction: "up" | "down") => {
    const index = sortedDocs.findIndex((d) => d.id === doc.id);
    if (index < 0) return;
    const newOrder =
      direction === "up" ? index : index + 2;
    try {
      await reorderDocument.mutateAsync({ documentId: doc.id, newOrder });
      toast({ title: "Document reordered", description: "Bates numbers will be reassigned." });
    } catch (err: any) {
      toast({ title: "Reorder failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleDeleteDocument = async (doc: DocumentListResponse) => {
    if (!window.confirm(`Delete ${doc.filename} from this packet? This cannot be undone.`)) return;
    try {
      await deleteDocument.mutateAsync(doc.id);
      toast({ title: "Document deleted" });
      if (selectedDoc?.id === doc.id) setSelectedDocId(null);
    } catch (err: any) {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    }
  };

  if (packetLoading) return <LoadingState message="Loading packet..." />;
  if (packetError) return <ErrorState message={packetError.message} onRetry={refetchPacket} />;
  if (!packet) return <ErrorState message="Packet not found." />;

  const batesStartLabel = packet.bates_prefix
    ? `${packet.bates_prefix}${String(packet.bates_start_number ?? 1).padStart(packet.bates_padding ?? 6, "0")}+`
    : "Not configured";

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Workspace Header Bar */}
      <div className="p-4 px-6 border-b border-slate-800/90 bg-slate-900/80 backdrop-blur-xl shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-white tracking-tight">{packet.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {batesStartLabel}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2">
              <span>ID: {packet.id.slice(0, 8)}...</span>
              <span>•</span>
              <span className="text-slate-300 font-bold">{documents ? documents.length : 0}</span> documents
              <span>•</span>
              <span className="text-slate-300 font-bold">{documents?.reduce((sum, d) => sum + (d.page_count ?? 0), 0) ?? 0}</span> pages
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.png,.jpg,.jpeg,.tiff,.tif"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleProcess} disabled={startProcessing.isPending}>
              {startProcessing.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
              Process
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAssignBates} disabled={assignBates.isPending}>
              {assignBates.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              Assign Bates
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBuild} disabled={buildPacket.isPending || validatePacket.isPending}>
              {buildPacket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Build Packet
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleVerify} disabled={verifyPacket.isPending}>
              {verifyPacket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Verify
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={downloadPacket.isPending}>
              {downloadPacket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Verification Results Banner */}
      {verifyResult && (
        <div className={clsx(
          "border-b px-6 py-4 backdrop-blur-md animate-fade-in shadow-inner",
          verifyResult.status === "VERIFIED"
            ? "bg-emerald-950/40 border-emerald-800/80"
            : verifyResult.status === "NOT_BUILT"
              ? "bg-amber-950/40 border-amber-800/80"
              : "bg-rose-950/40 border-rose-800/80"
        )}>
          <div className="flex items-start gap-4 max-w-6xl mx-auto">
            <div className="flex-shrink-0 mt-0.5">
              {verifyResult.status === "VERIFIED" ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              ) : verifyResult.status === "NOT_BUILT" ? (
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              ) : (
                <XCircle className="h-6 w-6 text-rose-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3">
                <h3 className={clsx(
                  "text-base font-display font-bold",
                  verifyResult.status === "VERIFIED" ? "text-emerald-200" :
                  verifyResult.status === "NOT_BUILT" ? "text-amber-200" : "text-rose-200"
                )}>
                  {verifyResult.status === "VERIFIED" ? "PACKET CRYPTOGRAPHICALLY VERIFIED" :
                   verifyResult.status === "NOT_BUILT" ? "NOT YET BUILT" : "VERIFICATION FAILED"}
                </h3>
                {verifyResult.bates_start && verifyResult.bates_end && (
                  <span className="text-xs text-slate-300 font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
                    {verifyResult.bates_start} → {verifyResult.bates_end}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-400 font-mono">
                {verifyResult.page_count} pages · {verifyResult.exhibits} exhibits
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                {verifyResult.checks.map((check: any) => (
                  <div key={check.name} className="flex items-center gap-2 text-xs font-mono">
                    {check.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                    )}
                    <span className={clsx("truncate", check.passed ? "text-slate-300" : "text-rose-300 font-semibold")}>
                      {check.name.replace(/_/g, " ")}
                    </span>
                    {check.detail && !check.passed && (
                      <span className="text-[10px] text-rose-400 truncate hidden lg:inline" title={check.detail}>
                        ({check.detail})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setVerifyResult(null)}
              className="flex-shrink-0 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigator Sidebar */}
        <aside className="w-72 border-r border-slate-800/80 bg-slate-900/60 flex flex-col overflow-hidden backdrop-blur-md shrink-0">
          <div className="p-3 border-b border-slate-800/80">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="documents" className="text-xs py-1">Docs</TabsTrigger>
                <TabsTrigger value="processing" className="text-xs py-1">Queue</TabsTrigger>
                <TabsTrigger value="review" className="text-xs py-1">Review</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTab === "documents" && (
              <div className="space-y-2">
                {docsLoading && <LoadingState message="Loading documents..." />}
                {docsError && <ErrorState message={docsError.message} onRetry={refetchDocs} />}
                {!docsLoading && !docsError && (!documents || documents.length === 0) && (
                  <div className="text-center py-12 text-slate-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-xs font-medium text-slate-400">No documents yet.</p>
                    <p className="text-[11px] text-slate-500 mt-1">Upload PDF, DOCX, or scans.</p>
                  </div>
                )}
                {sortedDocs.map((doc, index) => (
                  <div
                    key={doc.id}
                    className={clsx(
                      "p-3 rounded-xl border transition-all duration-150 group",
                      selectedDoc?.id === doc.id
                        ? "border-sky-500/50 bg-sky-500/10 shadow-sm"
                        : "border-slate-800/80 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/40"
                    )}
                  >
                    <button
                      onClick={() => setSelectedDocId(doc.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-xs text-white truncate group-hover:text-sky-300 transition-colors">{doc.filename}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 text-[10px]">
                            <span className={clsx("px-1.5 py-0.2 rounded font-mono", statusColors[doc.status] ?? "bg-slate-800 text-slate-400")}>
                              {doc.status.replace("_", " ")}
                            </span>
                            <span className={clsx("px-1.5 py-0.2 rounded font-mono", privilegeColors[doc.privilege_status] ?? "bg-slate-800 text-slate-400")}>
                              {(doc.privilege_status ?? "pending").replace("_", " ")}
                            </span>
                          </div>
                          {doc.bates_range && (
                            <p className="text-xs text-sky-400 mt-1 font-mono font-medium">{doc.bates_range}</p>
                          )}
                          {doc.description && (
                            <div className="mt-1">
                              <p className="text-xs text-slate-400 truncate" title={doc.description}>{doc.description}</p>
                              {doc.description_source && (
                                <span className={clsx(
                                  "inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono",
                                  doc.description_source === "content_summary"
                                    ? "bg-sky-500/10 text-sky-300 border border-sky-500/20"
                                    : "bg-slate-800 text-slate-400"
                                )}>
                                  {doc.description_source === "content_summary" ? "Content-derived" : "Filename-based"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-slate-800/80">
                      <button
                        title="Move up"
                        onClick={() => handleMoveDocument(doc, "up")}
                        disabled={index === 0 || reorderDocument.isPending}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Move down"
                        onClick={() => handleMoveDocument(doc, "down")}
                        disabled={index === sortedDocs.length - 1 || reorderDocument.isPending}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Download original"
                        onClick={() => handleDownloadDocument(doc)}
                        disabled={downloadDocument.isPending}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-sky-400 disabled:opacity-30 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Delete document"
                        onClick={() => handleDeleteDocument(doc)}
                        disabled={deleteDocument.isPending}
                        className="p-1 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 disabled:opacity-30 ml-auto transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {!docsLoading && !docsError && (
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 mt-2" onClick={() => fileInputRef.current?.click()}>
                    <Plus className="h-4 w-4" />
                    Add Documents
                  </Button>
                )}
              </div>
            )}

            {activeTab === "processing" && (
              <div className="space-y-3">
                <div className="p-3.5 bg-sky-950/30 rounded-xl border border-sky-800/60">
                  <p className="text-xs font-semibold text-sky-300">Processing Pipeline</p>
                  <p className="text-[11px] text-sky-400/80 font-mono mt-1">
                    {processingStatus?.status_breakdown?.queued ?? 0} queued |{" "}
                    {processingStatus?.status_breakdown?.processing ?? 0} processing |{" "}
                    {processingStatus?.status_breakdown?.failed ?? 0} failed
                  </p>
                </div>
                <div className="space-y-2">
                  {processingStatus?.documents?.filter((d) => d.status !== "completed").map((doc) => (
                    <div key={doc.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1.5">
                      <p className="text-xs font-semibold text-white truncate">{doc.filename}</p>
                      <div className="flex items-center gap-2">
                        <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-mono", statusColors[doc.status] ?? "bg-slate-800 text-slate-400")}>
                          {doc.status.replace("_", " ")}
                        </span>
                        {doc.error && <span className="text-[11px] text-rose-400 truncate">{doc.error}</span>}
                      </div>
                      {doc.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 text-xs"
                          onClick={() => retryDocument.mutate({ packetId, documentId: doc.id })}
                          disabled={retryDocument.isPending}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </div>
                  ))}
                  {(!processingStatus?.documents || processingStatus.documents.length === 0) && (
                    <p className="text-center text-xs text-slate-500 py-6">
                      No documents in the queue.
                    </p>
                  )}
                  {processingStatus?.documents?.every((d) => d.status === "completed") && (
                    <p className="text-center text-xs text-emerald-400 font-medium py-6">
                      All documents processed.
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "review" && (
              <div className="space-y-3">
                <div className="p-3.5 bg-indigo-950/30 rounded-xl border border-indigo-800/60">
                  <p className="text-xs font-semibold text-indigo-300">AI Review Queue</p>
                  <p className="text-[11px] text-indigo-400 font-mono mt-1">
                    {processingStatus?.status_breakdown?.waiting_review ?? 0} documents awaiting review
                  </p>
                </div>
                <div className="space-y-2">
                  {processingStatus?.documents
                    ?.filter((d) => d.status === "waiting_review" || d.status === "ai_analysis")
                    .map((doc) => (
                      <div key={doc.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                        <p className="text-xs font-semibold text-white truncate">{doc.filename}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {doc.status === "waiting_review" ? "Awaiting approval of AI changes" : "AI analysis in progress"}
                        </p>
                      </div>
                    ))}
                  {(!processingStatus?.documents?.some((d) => d.status === "waiting_review" || d.status === "ai_analysis")) && (
                    <p className="text-center text-xs text-slate-500 py-6">No documents awaiting review.</p>
                  )}
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => setActiveTab("ai-changes")}>
                    <Send className="h-3.5 w-3.5" />
                    Go to AI Review Panel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Panel */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-950">
          <div className="p-3 px-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden md:flex">
              <TabsList>
                <TabsTrigger value="documents">Document Viewer</TabsTrigger>
                <TabsTrigger value="ai-changes">AI Changes</TabsTrigger>
                <TabsTrigger value="privilege">Privilege</TabsTrigger>
                <TabsTrigger value="redactions">Redactions</TabsTrigger>
                <TabsTrigger value="audit">Audit Trail</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-auto p-6 bg-slate-950">
            {activeTab === "ai-changes" && selectedDoc && (
              <AiChangesPanel packetId={packetId} selectedDoc={selectedDoc} />
            )}
            {activeTab === "ai-changes" && !selectedDoc && (
              <div className="max-w-4xl mx-auto bg-slate-900/60 rounded-2xl border border-slate-800 p-12 text-center text-slate-400">
                <FileText className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <p className="text-slate-300 font-medium">Select a document to run AI analysis</p>
                <p className="text-xs text-slate-500 mt-1">Choose an exhibit from the left sidebar to generate proposals.</p>
              </div>
            )}
            {activeTab === "privilege" && <PrivilegePanel packetId={packetId} documents={documents} />}
            {activeTab === "redactions" && <RedactionsPanel packetId={packetId} candidates={redactionCandidates} />}
            {activeTab === "audit" && <AuditPanel packetId={packetId} />}

            {activeTab === "documents" && (
              <div className="max-w-5xl mx-auto bg-slate-900/70 rounded-2xl border border-slate-800/90 p-6 shadow-xl space-y-6">
                {selectedDoc ? (
                  <>
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
                      <div>
                        <h2 className="text-lg font-display font-bold text-white">{selectedDoc.filename}</h2>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">Exhibit Page Count: {selectedDoc.page_count}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => handleDownloadDocument(selectedDoc)}
                          disabled={downloadDocument.isPending}
                        >
                          {downloadDocument.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Download
                        </Button>
                        <span className={clsx("px-2 py-0.5 rounded text-xs font-mono", statusColors[selectedDoc.status] ?? "bg-slate-800 text-slate-400")}>
                          {selectedDoc.status.replace("_", " ")}
                        </span>
                        <span className={clsx("px-2 py-0.5 rounded text-xs font-mono", privilegeColors[selectedDoc.privilege_status] ?? "bg-slate-800 text-slate-400")}>
                          {(selectedDoc.privilege_status ?? "pending").replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 min-h-[500px]">
                      <DocumentPdfViewer
                        packetId={packetId}
                        documentId={selectedDoc.id}
                        fileName={selectedDoc.filename}
                        pageCount={selectedDoc.page_count}
                        batesRange={selectedDoc.bates_range}
                        onDownload={() => handleDownloadDocument(selectedDoc)}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-xs font-mono pt-4 border-t border-slate-800/80">
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-slate-500 uppercase tracking-wider text-[10px]">Document Type</p>
                        <p className="text-slate-200 font-semibold mt-1">{selectedDoc.document_type.toUpperCase()}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-slate-500 uppercase tracking-wider text-[10px]">Total Pages</p>
                        <p className="text-slate-200 font-semibold mt-1">{selectedDoc.page_count}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <p className="text-slate-500 uppercase tracking-wider text-[10px]">Bates Range</p>
                        <p className="text-sky-400 font-semibold mt-1">{selectedDoc.bates_range || "Not assigned"}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm text-slate-300 font-medium">Select a document from the left sidebar to preview</p>
                    <p className="text-xs text-slate-500 mt-1">Preview native PDFs, OCR extracted text layers, and Bates stamps.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "processing" && (
              <div className="max-w-5xl mx-auto bg-slate-900/70 rounded-2xl border border-slate-800/90 p-6 shadow-xl space-y-4">
                <h2 className="text-lg font-display font-bold text-white">Document Processing Status</h2>
                <div className="space-y-2.5">
                  {processingStatus?.documents?.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{doc.filename}</p>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">
                          {doc.page_count} pages • {doc.is_searchable ? "searchable text" : "no text layer"}
                          {doc.error && ` • ${doc.error}`}
                        </p>
                      </div>
                      <span className={clsx("px-2.5 py-0.5 rounded text-xs font-mono flex-shrink-0", statusColors[doc.status] ?? "bg-slate-800 text-slate-400")}>
                        {doc.status.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                  {(!processingStatus?.documents || processingStatus.documents.length === 0) && (
                    <p className="text-center text-xs text-slate-500 py-8">No documents loaded.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "review" && (
              <div className="max-w-5xl mx-auto bg-slate-900/70 rounded-2xl border border-slate-800/90 p-6 shadow-xl space-y-3">
                <h2 className="text-lg font-display font-bold text-white">AI Review Queue</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Documents awaiting AI analysis or human approval of proposed changes. Use the AI Changes tab to
                  request and review analysis for a selected document.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Right Telemetry & Quick Action Sidebar */}
        <aside className="w-80 border-l border-slate-800/80 bg-slate-900/60 overflow-y-auto p-4 hidden lg:block backdrop-blur-md space-y-4 shrink-0">
          <div className="p-4 bg-sky-950/30 rounded-2xl border border-sky-800/50 space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-sky-400 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Quick Actions
            </h3>
            <div className="space-y-2">
              <Button variant="secondary" size="sm" className="w-full justify-start gap-2 text-xs" onClick={handleAssignBates} disabled={assignBates.isPending}>
                {assignBates.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" /> : <Shield className="h-3.5 w-3.5 text-sky-400" />}
                Assign Bates Numbers
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => setActiveTab("ai-changes")}>
                <Send className="h-3.5 w-3.5 text-indigo-400" />
                AI Review Proposals
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start gap-2 text-xs" onClick={handleDetectRedactions} disabled={detectRedactions.isPending}>
                {detectRedactions.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> : <Search className="h-3.5 w-3.5 text-amber-400" />}
                Detect Redactions
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start gap-2 text-xs" onClick={handleBuild} disabled={buildPacket.isPending || validatePacket.isPending}>
                {buildPacket.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> : <FileText className="h-3.5 w-3.5 text-emerald-400" />}
                Build Final Packet
              </Button>
            </div>
          </div>

          {selectedDoc && (
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
              <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-300">Selected Exhibit</h3>
              <dl className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Status</dt>
                  <dd className="font-semibold capitalize text-slate-200">{selectedDoc.status.replace("_", " ")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Privilege</dt>
                  <dd className="font-semibold capitalize text-slate-200">{(selectedDoc.privilege_status ?? "pending").replace("_", " ")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Pages</dt>
                  <dd className="font-semibold text-slate-200">{selectedDoc.page_count}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Bates</dt>
                  <dd className="font-semibold text-sky-400">{selectedDoc.bates_range || "Not assigned"}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
            <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-300">Packet Summary</h3>
            <dl className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <dt className="text-slate-400">Documents</dt>
                <dd className="font-semibold text-slate-200">{documents?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Total Pages</dt>
                <dd className="font-semibold text-slate-200">{documents?.reduce((sum, d) => sum + (d.page_count ?? 0), 0) ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Privileged</dt>
                <dd className="font-semibold text-rose-400">{privilegeLog?.total_privileged_documents ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Redactions</dt>
                <dd className="font-semibold text-amber-400">{redactionCandidates?.length ?? 0}</dd>
              </div>
              {batesPreview?.start_label && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Bates Preview</dt>
                  <dd className="font-semibold font-mono text-xs text-sky-400">
                    {batesPreview.start_label} - {batesPreview.end_label}
                  </dd>
                </div>
              )}
              {manifest && (
                <div className="flex justify-between pt-1 border-t border-slate-800">
                  <dt className="text-slate-400">Manifest</dt>
                  <dd className="font-semibold flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    SHA-256 Valid
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2.5">
            <h3 className="text-xs font-mono uppercase tracking-wider font-semibold text-slate-300">Redactions & PII</h3>
            <p className="text-xs text-slate-400">
              <span className="text-amber-400 font-bold">{redactionCandidates?.length ?? 0}</span> candidate(s) detected
            </p>
            <Button variant="secondary" size="sm" className="w-full justify-start gap-2 text-xs" onClick={handleDetectRedactions} disabled={detectRedactions.isPending}>
              {detectRedactions.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Scan for PII
            </Button>
            <Button variant="secondary" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => setActiveTab("redactions")}>
              <Check className="h-3.5 w-3.5" />
              Review Candidates
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}