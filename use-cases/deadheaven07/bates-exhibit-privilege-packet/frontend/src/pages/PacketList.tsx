import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FileText, Search, Trash2, Edit, Loader2, AlertCircle, Download, Layers, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { usePackets, useDeletePacket, useUpdatePacket } from "@/hooks/usePackets";
import { useCreatePacket } from "@/hooks/usePackets";
import { exportsApi } from "@/services/exports";
import { toast } from "@/components/ui/use-toast";
import type { Packet } from "@/types/api";

const getStatusBadge = (status: string) => {
  const styles = {
    completed: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
    in_progress: "bg-sky-500/10 text-sky-400 border border-sky-500/30",
    draft: "bg-slate-800 text-slate-400 border border-slate-700",
    failed: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
  };
  return styles[status as keyof typeof styles] || styles.draft;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function PacketList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPackets, setSelectedPackets] = useState<string[]>([]);
  const [newPacketName, setNewPacketName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPacket, setEditingPacket] = useState<Packet | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const { data: packets, isLoading, error, refetch } = usePackets();
  const deletePacket = useDeletePacket();
  const createPacket = useCreatePacket();
  const updatePacket = useUpdatePacket();

  const handleCreatePacket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPacketName.trim()) return;
    if (editingPacket) {
      await updatePacket.mutateAsync({ id: editingPacket.id, data: { name: newPacketName.trim() } });
      toast({ title: "Packet updated", description: `"${newPacketName.trim()}" saved.` });
    } else {
      await createPacket.mutateAsync({ name: newPacketName.trim() });
      toast({ title: "Packet created", description: `"${newPacketName.trim()}" created.` });
    }
    setNewPacketName("");
    setEditingPacket(null);
    setShowCreateModal(false);
    refetch();
  };

  const openEditModal = (packet: Packet) => {
    setEditingPacket(packet);
    setNewPacketName(packet.name);
    setShowCreateModal(true);
  };

  const handleBulkExport = async () => {
    setIsExporting(true);
    try {
      for (const id of selectedPackets) {
        try {
          const blob = await exportsApi.download(id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${packets?.find((p) => p.id === id)?.name ?? "packet"}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          toast({ title: "Export skipped", description: `Packet has no built final packet.`, variant: "destructive" });
        }
      }
      toast({ title: "Export complete", description: `${selectedPackets.length} packet(s) exported.` });
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedPackets.length} selected packet(s)? This cannot be undone.`)) return;
    setIsDeletingBulk(true);
    try {
      for (const id of selectedPackets) {
        await deletePacket.mutateAsync(id);
      }
      setSelectedPackets([]);
      toast({ title: "Packets deleted", description: `${selectedPackets.length} packet(s) removed.` });
      refetch();
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const filteredPackets = packets?.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const totalPages = packets?.reduce((acc, p) => acc + (p.total_pages || 0), 0) || 0;
  const completedPackets = packets?.filter((p) => p.status === "completed").length || 0;

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24 glass-panel-dark rounded-2xl border border-slate-800">
          <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
          <span className="mt-4 text-sm font-medium text-slate-300">Loading packets...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-rose-400" />
            <span className="text-base font-semibold text-rose-200">Failed to load packets</span>
          </div>
          <p className="text-sm text-rose-300 mt-2">{error.message}</p>
          <button 
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 text-sm font-medium bg-rose-600 text-white rounded-xl hover:bg-rose-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-bold tracking-tight text-white">Packets</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {packets?.length || 0} Total
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">Manage your Bates-stamped exhibit packets</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium text-sm rounded-xl shadow-glow-sm hover:shadow-glow-md transition-all duration-200 transform hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          New Packet
        </button>
      </div>

      {/* Analytics Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex items-center justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400 font-medium">Total Cases</p>
            <p className="text-2xl font-display font-bold text-white mt-1">{packets?.length || 0} active</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex items-center justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400 font-medium">Bates Stamped</p>
            <p className="text-2xl font-display font-bold text-white mt-1">{totalPages} pages total</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex items-center justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-slate-400 font-medium">Built & Verified</p>
            <p className="text-2xl font-display font-bold text-emerald-400 mt-1">{completedPackets} ready</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h2 className="text-xl font-display font-bold text-white">{editingPacket ? "Edit Packet" : "Create New Packet"}</h2>
            <form onSubmit={handleCreatePacket} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 font-medium mb-1.5">Packet Name</label>
                <input
                  type="text"
                  value={newPacketName}
                  onChange={(e) => setNewPacketName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
                  placeholder="e.g., Smith v. Jones - Exhibits"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingPacket(null);
                    setNewPacketName("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createPacket.isPending || updatePacket.isPending}
                  className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl shadow-glow-sm disabled:opacity-50 transition-all"
                >
                  {(createPacket.isPending || updatePacket.isPending) ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    editingPacket ? 'Save Changes' : 'Create Packet'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/30 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search packets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950/80 border border-slate-700/70 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/50 border-b border-slate-800 text-[11px] font-mono uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3.5 w-12">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                    checked={selectedPackets.length === filteredPackets.length && filteredPackets.length > 0}
                    onChange={(e) =>
                      setSelectedPackets(
                        e.target.checked ? filteredPackets.map((p) => p.id) : []
                      )
                    }
                  />
                </th>
                <th className="px-5 py-3.5">Packet</th>
                <th className="px-5 py-3.5">Documents</th>
                <th className="px-5 py-3.5">Pages</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Updated</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {filteredPackets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    <Layers className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                    <p className="text-slate-300 font-medium">No packets found</p>
                    <p className="text-xs text-slate-400 mt-1">Create your first packet to get started.</p>
                  </td>
                </tr>
              ) : (
                filteredPackets.map((packet) => (
                  <tr
                    key={packet.id}
                    className="hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
                        checked={selectedPackets.includes(packet.id)}
                        onChange={(e) =>
                          setSelectedPackets((prev) =>
                            e.target.checked
                              ? [...prev, packet.id]
                              : prev.filter((id) => id !== packet.id)
                          )
                        }
                      />
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        to={`/packets/${packet.id}`}
                        className="font-semibold text-white group-hover:text-sky-400 transition-colors flex items-center gap-2"
                      >
                        <span>{packet.name}</span>
                        {packet.bates_prefix && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            {packet.bates_prefix}
                          </span>
                        )}
                      </Link>
                      {packet.description && (
                        <p className="text-xs text-slate-400 mt-1 max-w-md line-clamp-1">{packet.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-300">{packet.document_count ?? 0}</td>
                    <td className="px-5 py-4 font-mono text-slate-300">{packet.total_pages ?? 0}</td>
                    <td className="px-5 py-4">
                      <span
                        className={clsx(
                          "inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full",
                          getStatusBadge(packet.status || 'draft')
                        )}
                      >
                        {(packet.status || 'draft').replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 text-xs font-mono">
                      {packet.updated_at ? formatDate(packet.updated_at) : 'N/A'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/packets/${packet.id}`}
                          className="p-2 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Open"
                        >
                          <FileText className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => openEditModal(packet)}
                          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            deletePacket.mutate(packet.id);
                            setSelectedPackets((prev) => prev.filter((id) => id !== packet.id));
                          }}
                          disabled={deletePacket.isPending}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Bulk Action Floating Drawer */}
        {selectedPackets.length > 0 && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between animate-slide-up">
            <span className="text-xs font-mono text-slate-300">
              <span className="text-sky-400 font-bold">{selectedPackets.length}</span> packet(s) selected
            </span>
            <div className="flex gap-2.5">
              <button
                onClick={handleBulkExport}
                disabled={isExporting}
                className="px-3.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
              >
                {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" /> : <Download className="h-3.5 w-3.5" />}
                Export
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeletingBulk}
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-950/40 border border-rose-800 text-rose-300 hover:bg-rose-900/60 rounded-lg disabled:opacity-50 transition-colors"
              >
                {isDeletingBulk ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}