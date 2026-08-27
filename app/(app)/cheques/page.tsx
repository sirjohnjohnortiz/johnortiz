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
  const [tab, setTab] = useState<"pending" | "archived">("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExistingFile, setEditingExistingFile] = useState<string | null>(null);

  const [filterUnit, setFilterUnit] = useState("");
  const [sortBy, setSortBy] = useState("date_asc");

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

  const filtered = useMemo(() => {
    let list = cheques.filter((c) => c.status === tab);
    if (filterUnit) list = list.filter((c) => c.unit_id === filterUnit);

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return b.cheque_date.localeCompare(a.cheque_date);
        case "amount_desc":
          return Number(b.amount) - Number(a.amount);
        case "amount_asc":
          return Number(a.amount) - Number(b.amount);
        case "unit_name":
          return (a.units?.unit_name ?? "").localeCompare(b.units?.unit_name ?? "");
        case "date_asc":
        default:
          return a.cheque_date.localeCompare(b.cheque_date);
      }
    });
    return list;
  }, [cheques, tab, filterUnit, sortBy]);

  const summary = useMemo(() => {
    const relevant = filterUnit ? cheques.filter((c) => c.unit_id === filterUnit) : cheques;
    const pendingTotal = relevant.filter((c) => c.status === "pending").reduce((s, c) => s + Number(c.amount), 0);
    const archivedTotal = relevant.filter((c) => c.status === "archived").reduce((s, c) => s + Number(c.amount), 0);
    return {
      pendingCount: relevant.filter((c) => c.status === "pending").length,
      archivedCount: relevant.filter((c) => c.status === "archived").length,
      pendingTotal,
      archivedTotal,
    };
  }, [cheques, filterUnit]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
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

      {/* Filter, sort, and summary */}
      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label-field">Filter by unit / tenant</label>
            <select className="input-field" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_name} {u.tenants?.[0]?.full_name ? `— ${u.tenants[0].full_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">Sort by</label>
            <select className="input-field" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date_asc">Cheque date (earliest first)</option>
              <option value="date_desc">Cheque date (latest first)</option>
              <option value="amount_desc">Amount (highest first)</option>
              <option value="amount_asc">Amount (lowest first)</option>
              <option value="unit_name">Unit name (A–Z)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-paper px-3 py-2">
            <p className="text-xs text-inkmuted uppercase tracking-wide">Pending</p>
            <p className="font-display font-semibold">{summary.pendingCount} cheques · ₱{summary.pendingTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-md bg-paper px-3 py-2">
            <p className="text-xs text-inkmuted uppercase tracking-wide">Archived</p>
            <p className="font-display font-semibold">{summary.archivedCount} cheques · ₱{summary.archivedTotal.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("pending")}
          className={tab === "pending" ? "btn-primary text-xs" : "btn-secondary text-xs"}
        >
          Pending ({cheques.filter((c) => (filterUnit ? c.unit_id === filterUnit : true) && c.status === "pending").length})
        </button>
        <button
          onClick={() => setTab("archived")}
          className={tab === "archived" ? "btn-primary text-xs" : "btn-secondary text-xs"}
        >
          Archived ({cheques.filter((c) => (filterUnit ? c.unit_id === filterUnit : true) && c.status === "archived").length})
        </button>
      </div>

      <div className="card divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">
            {tab === "pending" ? "No pending cheques." : "No archived cheques."}
          </p>
        ) : (
          filtered.map((c) => (
            <ChequeRow
              key={c.id}
              c={c}
              onEdit={() => startEdit(c)}
              onArchive={() => archiveCheque(c.id)}
              onUnarchive={() => unarchiveCheque(c.id)}
              onDelete={() => deleteCheque(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChequeRow({
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
    <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink text-sm">
          {c.units?.unit_name} {c.tenants?.full_name ? `— ${c.tenants.full_name}` : ""}
        </p>
        <p className="text-xs text-inkmuted mt-0.5">
          {c.cheque_date} · ₱{Number(c.amount).toLocaleString()}
          {c.cheque_number ? ` · Cheque #${c.cheque_number}` : ""}
          {c.bank_name ? ` · ${c.bank_name}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={handleView} className="text-xs text-seal underline">View</button>
        <button onClick={onEdit} className="text-xs text-seal underline">Edit</button>
        {c.status === "pending" ? (
          <button onClick={onArchive} className="text-xs text-inkmuted underline">Archive (paid)</button>
        ) : (
          <button onClick={onUnarchive} className="text-xs text-inkmuted underline">Move back to pending</button>
        )}
        <button onClick={onDelete} className="text-xs text-bad underline">Delete</button>
      </div>
    </div>
  );
}
