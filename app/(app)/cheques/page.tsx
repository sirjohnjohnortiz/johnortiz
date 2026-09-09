"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import type { Cheque, Unit, Tenant } from "@/types";

const EMPTY_FORM = {
  unit_id: "",
  cheque_date: "",
  amount: "",
  cheque_number: "",
  bank_name: "",
};

export default function ChequesPage() {
  const supabase = createClient();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [units, setUnits] = useState<(Unit & { tenants: Tenant[] })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<"pending" | "archived">("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExistingFile, setEditingExistingFile] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [activeUnitId, setActiveUnitId] = useState<string>("__all__");
  const [sortBy, setSortBy] = useState("date_asc");
  const [searchText, setSearchText] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [form, setForm] = useState({ ...EMPTY_FORM });

  async function loadData() {
    const { data: c, error: loadErr } = await supabase
      .from("cheques")
      .select("*, units(*), tenants(*)")
      .order("cheque_date", { ascending: true });
    if (loadErr) {
      setError("Couldn't load cheques: " + loadErr.message);
    } else {
      setCheques((c as any) ?? []);
    }
    const { data: u } = await supabase.from("units").select("*, tenants(*)").order("unit_name");
    setUnits((u as any) ?? []);
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setFilePath(null);
    setEditingId(null);
    setEditingExistingFile(null);
  }

  function startEdit(c: Cheque) {
    setEditingId(c.id);
    setForm({
      unit_id: c.unit_id,
      cheque_date: c.cheque_date,
      amount: String(c.amount ?? ""),
      cheque_number: c.cheque_number ?? "",
      bank_name: c.bank_name ?? "",
    });
    setFilePath(null);
    setEditingExistingFile(c.file_url);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unit_id || !form.cheque_date) return;
    if (!editingId && !filePath) return;
    setSaving(true);
    setError(null);

    if (editingId) {
      const { error: updateErr } = await supabase
        .from("cheques")
        .update({
          unit_id: form.unit_id,
          cheque_date: form.cheque_date,
          amount: parseFloat(form.amount) || 0,
          cheque_number: form.cheque_number || null,
          bank_name: form.bank_name || null,
          ...(filePath ? { file_url: filePath } : {}),
        })
        .eq("id", editingId);
      setSaving(false);
      if (updateErr) {
        setError("Couldn't update this cheque: " + updateErr.message);
        return;
      }
    } else {
      const unit = units.find((u) => u.id === form.unit_id);
      const tenant = unit?.tenants?.find((t) => t.active);
      const { error: insertErr } = await supabase.from("cheques").insert({
        unit_id: form.unit_id,
        tenant_id: tenant?.id ?? null,
        cheque_date: form.cheque_date,
        amount: parseFloat(form.amount) || 0,
        cheque_number: form.cheque_number || null,
        bank_name: form.bank_name || null,
        file_url: filePath,
        status: "pending",
      });
      setSaving(false);
      if (insertErr) {
        setError("Couldn't save this cheque: " + insertErr.message);
        return;
      }
    }

    resetForm();
    setShowForm(false);
    loadData();
  }

  async function archiveCheque(id: string) {
    await supabase.from("cheques").update({ status: "archived" }).eq("id", id);
    loadData();
  }

  async function unarchiveCheque(id: string) {
    await supabase.from("cheques").update({ status: "pending" }).eq("id", id);
    loadData();
  }

  async function deleteCheque(id: string) {
    if (!confirm("Delete this cheque record permanently? This cannot be undone.")) return;
    await supabase.from("cheques").delete().eq("id", id);
    loadData();
  }

  async function bulkArchive() {
    if (selected.size === 0) return;
    await supabase.from("cheques").update({ status: "archived" }).in("id", Array.from(selected));
    setSelected(new Set());
    loadData();
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected cheque(s) permanently?`)) return;
    await supabase.from("cheques").delete().in("id", Array.from(selected));
    setSelected(new Set());
    loadData();
  }

  const unitsWithCheques = useMemo(() => {
    const idsWithCheques = new Set(cheques.map((c) => c.unit_id));
    return units.filter((u) => idsWithCheques.has(u.id));
  }, [units, cheques]);

  function countFor(unitId: string) {
    return cheques.filter((c) => c.unit_id === unitId && c.status === statusTab).length;
  }

  const filtered = useMemo(() => {
    let list = cheques.filter((c) => c.status === statusTab);
    if (activeUnitId !== "__all__") list = list.filter((c) => c.unit_id === activeUnitId);
    if (dateStart) list = list.filter((c) => c.cheque_date >= dateStart);
    if (dateEnd) list = list.filter((c) => c.cheque_date <= dateEnd);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((c) => {
        const haystack = [
          c.units?.unit_name,
          c.tenants?.full_name,
          c.bank_name,
          c.cheque_number,
          String(c.amount),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return b.cheque_date.localeCompare(a.cheque_date);
        case "amount_desc":
          return Number(b.amount) - Number(a.amount);
        case "amount_asc":
          return Number(a.amount) - Number(b.amount);
        case "date_asc":
        default:
          return a.cheque_date.localeCompare(b.cheque_date);
      }
    });
    return list;
  }, [cheques, statusTab, activeUnitId, sortBy, searchText, dateStart, dateEnd]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = filtered.slice((pageSafe - 1) * rowsPerPage, pageSafe * rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [statusTab, activeUnitId, sortBy, searchText, dateStart, dateEnd, rowsPerPage]);

  const overall = useMemo(() => {
    const pending = cheques.filter((c) => c.status === "pending");
    const archived = cheques.filter((c) => c.status === "archived");
    const dates = cheques.map((c) => c.cheque_date).filter(Boolean).sort();
    return {
      pendingCount: pending.length,
      pendingTotal: pending.reduce((s, c) => s + Number(c.amount), 0),
      archivedCount: archived.length,
      archivedTotal: archived.reduce((s, c) => s + Number(c.amount), 0),
      tenantCount: unitsWithCheques.length,
      dateRange: dates.length > 0 ? `${dates[0].slice(0, 4)}–${dates[dates.length - 1].slice(0, 4)}` : "—",
    };
  }, [cheques, unitsWithCheques]);

  function toggleSelectAll() {
    if (selected.size === paginated.length && paginated.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((c) => c.id)));
    }
  }

  function toggleSelectOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function resetFilters() {
    setActiveUnitId("__all__");
    setSearchText("");
    setDateStart("");
    setDateEnd("");
    setSortBy("date_asc");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Cheques</h1>
          <p className="text-sm text-inkmuted mt-1">
            Post-dated cheques from tenants — upload the year's batch, then archive or delete each month.
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm();
            setShowForm((s) => !s);
          }}
          className="btn-primary text-sm"
        >
          {showForm ? "Cancel" : "+ Upload Cheque"}
        </button>
      </div>

      {error && (
        <div className="card p-4 mb-4 border-bad/40">
          <p className="text-sm text-bad">{error}</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          {editingId && (
            <p className="text-xs font-semibold uppercase tracking-wide text-seal">Editing existing cheque</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Unit / tenant</label>
              <select
                required
                className="input-field"
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Select a unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_name} {u.tenants?.[0]?.full_name ? `— ${u.tenants[0].full_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Cheque date (month it covers)</label>
              <input
                required
                type="date"
                className="input-field"
                value={form.cheque_date}
                onChange={(e) => setForm({ ...form, cheque_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label-field">Amount (₱)</label>
              <input
                required
                type="number"
                step="0.01"
                className="input-field"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Cheque number (optional)</label>
              <input
                className="input-field"
                value={form.cheque_number}
                onChange={(e) => setForm({ ...form, cheque_number: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Bank name (optional)</label>
              <input
                className="input-field"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              />
            </div>
          </div>
          <FileUploadField
            bucket="cheques"
            label="Cheque photo/scan"
            existingPath={editingExistingFile}
            onUploaded={setFilePath}
            accept="image/*,.pdf"
          />
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving…" : editingId ? "Update cheque" : "Save cheque"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="btn-secondary text-sm"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">Pending</p>
          <p className="font-display text-2xl font-semibold mt-1 text-warn">{overall.pendingCount}</p>
          <p className="text-xs text-inkmuted mt-1">Total amount: ₱{overall.pendingTotal.toLocaleString()}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">Archived</p>
          <p className="font-display text-2xl font-semibold mt-1 text-good">{overall.archivedCount}</p>
          <p className="text-xs text-inkmuted mt-1">Total amount: ₱{overall.archivedTotal.toLocaleString()}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">Tenants</p>
          <p className="font-display text-2xl font-semibold mt-1 text-ink">{overall.tenantCount}</p>
          <p className="text-xs text-inkmuted mt-1">With cheques on file</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">Date Range</p>
          <p className="font-display text-2xl font-semibold mt-1 text-ink">{overall.dateRange}</p>
          <p className="text-xs text-inkmuted mt-1">Covered cheques</p>
        </div>
      </div>

      {/* Status + tenant tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        <button
          onClick={() => setStatusTab("pending")}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
            statusTab === "pending" ? "bg-ink text-paper border-ink" : "bg-card text-ink border-border hover:bg-paper"
          }`}
        >
          Pending ({cheques.filter((c) => c.status === "pending").length})
        </button>
        <button
          onClick={() => setStatusTab("archived")}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
            statusTab === "archived" ? "bg-ink text-paper border-ink" : "bg-card text-ink border-border hover:bg-paper"
          }`}
        >
          Archived ({cheques.filter((c) => c.status === "archived").length})
        </button>
        <span className="w-px bg-border shrink-0 my-1" />
        <button
          onClick={() => setActiveUnitId("__all__")}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
            activeUnitId === "__all__" ? "bg-seal text-white border-seal" : "bg-card text-ink border-border hover:bg-paper"
          }`}
        >
          All tenants
        </button>
        {unitsWithCheques.map((u) => (
          <button
            key={u.id}
            onClick={() => setActiveUnitId(u.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
              activeUnitId === u.id ? "bg-seal text-white border-seal" : "bg-card text-ink border-border hover:bg-paper"
            }`}
          >
            {u.unit_name} ({countFor(u.id)})
          </button>
        ))}
      </div>

      {/* Filter panel */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label-field">Select Tenant</label>
            <select className="input-field" value={activeUnitId} onChange={(e) => setActiveUnitId(e.target.value)}>
              <option value="__all__">All tenants</option>
              {unitsWithCheques.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_name} {u.tenants?.[0]?.full_name ? `— ${u.tenants[0].full_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">Date Range</label>
            <div className="flex items-center gap-2">
              <input type="date" className="input-field" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
              <span className="text-inkmuted text-sm">to</span>
              <input type="date" className="input-field" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-field">Sort By</label>
            <select className="input-field" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date_asc">Cheque date (earliest first)</option>
              <option value="date_desc">Cheque date (latest first)</option>
              <option value="amount_desc">Amount (highest first)</option>
              <option value="amount_asc">Amount (lowest first)</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            className="input-field flex-1"
            placeholder="Search tenant, bank, or amount…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={resetFilters} className="btn-secondary text-sm whitespace-nowrap">Reset</button>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="card p-3 mb-3 flex items-center justify-between bg-seal/5 border-seal/30">
          <p className="text-sm text-ink font-medium">{selected.size} selected</p>
          <div className="flex gap-2">
            {statusTab === "pending" && (
              <button onClick={bulkArchive} className="btn-secondary text-xs">Archive selected</button>
            )}
            <button onClick={bulkDelete} className="text-xs text-bad underline">Delete selected</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-display font-semibold text-ink">
            {statusTab === "pending" ? "Pending" : "Archived"} Cheques ({filtered.length})
          </h2>
          <p className="text-sm font-semibold text-ink">
            Total: ₱{filtered.reduce((s, c) => s + Number(c.amount), 0).toLocaleString()}
          </p>
        </div>

        {paginated.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No cheques match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-inkmuted">
                  <th className="px-4 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === paginated.length && paginated.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Tenant / Unit</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Bank</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelectOne(c.id)} />
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap font-mono text-xs text-inkmuted">{c.cheque_date}</td>
                    <td className="px-2 py-3">
                      <span className="font-medium text-ink">{c.units?.unit_name}</span>
                      {c.tenants?.full_name ? <span className="text-inkmuted"> — {c.tenants.full_name}</span> : ""}
                    </td>
                    <td className="px-2 py-3 font-medium">₱{Number(c.amount).toLocaleString()}</td>
                    <td className="px-2 py-3 text-inkmuted">{c.bank_name || "—"}</td>
                    <td className="px-2 py-3">
                      <ChequeRowActions
                        c={c}
                        onEdit={() => startEdit(c)}
                        onArchive={() => archiveCheque(c.id)}
                        onUnarchive={() => unarchiveCheque(c.id)}
                        onDelete={() => deleteCheque(c.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-inkmuted">
              Showing {(pageSafe - 1) * rowsPerPage + 1} to {Math.min(pageSafe * rowsPerPage, filtered.length)} of {filtered.length} entries
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-inkmuted">Rows per page</span>
                <select
                  className="input-field text-xs py-1"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageSafe === 1}
                  className="btn-secondary text-xs px-2 py-1 disabled:opacity-40"
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, pageSafe - 3), pageSafe + 2)
                  .map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`text-xs px-2.5 py-1 rounded-md ${
                        n === pageSafe ? "bg-ink text-paper" : "text-ink hover:bg-paper"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={pageSafe === totalPages}
                  className="btn-secondary text-xs px-2 py-1 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChequeRowActions({
  c,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  c: Cheque;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  async function handleView() {
    const newTab = window.open("", "_blank");
    const url = await getSignedUrl("cheques", c.file_url);
    if (url && newTab) {
      newTab.location.href = url;
    } else if (!newTab) {
      alert("Your browser blocked the popup. Please allow popups for this site and try again.");
    } else {
      alert("Couldn't open this file — it may be missing from storage.");
      newTab.close();
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button onClick={handleView} className="rounded-md border border-seal/40 text-seal text-xs px-2 py-1 hover:bg-seal/10">
        View
      </button>
      <button onClick={onEdit} className="rounded-md border border-warn/40 text-warn text-xs px-2 py-1 hover:bg-warn/10">
        Edit
      </button>
      {c.status === "pending" ? (
        <button onClick={onArchive} className="rounded-md bg-good text-white text-xs px-2 py-1 hover:opacity-90">
          Archive
        </button>
      ) : (
        <button onClick={onUnarchive} className="rounded-md border border-border text-inkmuted text-xs px-2 py-1 hover:bg-paper">
          Unarchive
        </button>
      )}
      <button onClick={onDelete} className="rounded-md bg-bad text-white text-xs px-2 py-1 hover:opacity-90">
        Delete
      </button>
    </div>
  );
}
