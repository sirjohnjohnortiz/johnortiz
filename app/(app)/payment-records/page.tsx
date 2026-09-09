"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import type { Unit, Tenant } from "@/types";

interface PaymentRecord {
  id: string;
  unit_id: string;
  tenant_id: string | null;
  payment_date: string;
  amount: number;
  bank_name: string | null;
  reference_number: string | null;
  deposit_slip_url: string;
  notes: string | null;
  created_at: string;
  units?: Unit;
  tenants?: Tenant;
}

const EMPTY_FORM = {
  unit_id: "",
  payment_date: "",
  amount: "",
  bank_name: "",
  reference_number: "",
  notes: "",
};

export default function PaymentRecordsPage() {
  const supabase = createClient();
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [units, setUnits] = useState<(Unit & { tenants: Tenant[] })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExistingFile, setEditingExistingFile] = useState<string | null>(null);

  const [filterUnit, setFilterUnit] = useState("__all__");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [showReport, setShowReport] = useState(false);
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");

  const [form, setForm] = useState({ ...EMPTY_FORM });

  async function loadData() {
    const { data: r, error: loadErr } = await supabase
      .from("payment_records")
      .select("*, units(*), tenants(*)")
      .order("payment_date", { ascending: false });
    if (loadErr) {
      setError("Couldn't load payment records: " + loadErr.message);
    } else {
      setRecords((r as any) ?? []);
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

  function startEdit(r: PaymentRecord) {
    setEditingId(r.id);
    setForm({
      unit_id: r.unit_id,
      payment_date: r.payment_date,
      amount: String(r.amount ?? ""),
      bank_name: r.bank_name ?? "",
      reference_number: r.reference_number ?? "",
      notes: r.notes ?? "",
    });
    setFilePath(null);
    setEditingExistingFile(r.deposit_slip_url);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unit_id || !form.payment_date) return;
    if (!editingId && !filePath) return;
    setSaving(true);
    setError(null);

    if (editingId) {
      const { error: updateErr } = await supabase
        .from("payment_records")
        .update({
          unit_id: form.unit_id,
          payment_date: form.payment_date,
          amount: parseFloat(form.amount) || 0,
          bank_name: form.bank_name || null,
          reference_number: form.reference_number || null,
          notes: form.notes || null,
          ...(filePath ? { deposit_slip_url: filePath } : {}),
        })
        .eq("id", editingId);
      setSaving(false);
      if (updateErr) {
        setError("Couldn't update this record: " + updateErr.message);
        return;
      }
    } else {
      const unit = units.find((u) => u.id === form.unit_id);
      const tenant = unit?.tenants?.find((t) => t.active);
      const { error: insertErr } = await supabase.from("payment_records").insert({
        unit_id: form.unit_id,
        tenant_id: tenant?.id ?? null,
        payment_date: form.payment_date,
        amount: parseFloat(form.amount) || 0,
        bank_name: form.bank_name || null,
        reference_number: form.reference_number || null,
        deposit_slip_url: filePath,
        notes: form.notes || null,
      });
      setSaving(false);
      if (insertErr) {
        setError("Couldn't save this record: " + insertErr.message);
        return;
      }
    }

    resetForm();
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this payment record permanently? This cannot be undone.")) return;
    await supabase.from("payment_records").delete().eq("id", id);
    loadData();
  }

  const filtered = useMemo(() => {
    let list = [...records];
    if (filterUnit !== "__all__") list = list.filter((r) => r.unit_id === filterUnit);
    if (dateStart) list = list.filter((r) => r.payment_date >= dateStart);
    if (dateEnd) list = list.filter((r) => r.payment_date <= dateEnd);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((r) => {
        const haystack = [r.units?.unit_name, r.tenants?.full_name, r.bank_name, r.reference_number, String(r.amount)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return a.payment_date.localeCompare(b.payment_date);
        case "amount_desc":
          return Number(b.amount) - Number(a.amount);
        case "amount_asc":
          return Number(a.amount) - Number(b.amount);
        case "date_desc":
        default:
          return b.payment_date.localeCompare(a.payment_date);
      }
    });
    return list;
  }, [records, filterUnit, dateStart, dateEnd, searchText, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = filtered.slice((pageSafe - 1) * rowsPerPage, pageSafe * rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [filterUnit, dateStart, dateEnd, searchText, sortBy, rowsPerPage]);

  const overall = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonth = records.filter((r) => r.payment_date.startsWith(monthKey));
    return {
      total: records.reduce((s, r) => s + Number(r.amount), 0),
      count: records.length,
      thisMonthTotal: thisMonth.reduce((s, r) => s + Number(r.amount), 0),
      thisMonthCount: thisMonth.length,
      banks: new Set(records.map((r) => r.bank_name).filter(Boolean)).size,
    };
  }, [records]);

  const report = useMemo(() => {
    if (!showReport) return null;
    let list = [...records];
    if (reportStart) list = list.filter((r) => r.payment_date >= reportStart);
    if (reportEnd) list = list.filter((r) => r.payment_date <= reportEnd);

    const byBank: Record<string, number> = {};
    const byTenant: Record<string, number> = {};
    list.forEach((r) => {
      const bank = r.bank_name || "Unspecified";
      const tenant = r.tenants?.full_name || r.units?.unit_name || "Unknown";
      byBank[bank] = (byBank[bank] || 0) + Number(r.amount);
      byTenant[tenant] = (byTenant[tenant] || 0) + Number(r.amount);
    });

    return {
      list,
      total: list.reduce((s, r) => s + Number(r.amount), 0),
      byBank: Object.entries(byBank).sort((a, b) => b[1] - a[1]),
      byTenant: Object.entries(byTenant).sort((a, b) => b[1] - a[1]),
    };
  }, [showReport, reportStart, reportEnd, records]);

  function exportCsv() {
    if (!report) return;
    const rows = [
      ["Date", "Unit", "Tenant", "Amount", "Bank", "Reference"],
      ...report.list.map((r) => [
        r.payment_date,
        r.units?.unit_name ?? "",
        r.tenants?.full_name ?? "",
        String(r.amount),
        r.bank_name ?? "",
        r.reference_number ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-report-${reportStart || "all"}-to-${reportEnd || "now"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Payment Records</h1>
          <p className="text-sm text-inkmuted mt-1">
            Every payment received — deposit slips, which bank, and when. Generate a report anytime.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowReport((s) => !s)} className="btn-secondary text-sm">
            {showReport ? "Hide Report" : "Generate Report"}
          </button>
          <button
            onClick={() => {
              if (showForm) resetForm();
              setShowForm((s) => !s);
            }}
            className="btn-primary text-sm"
          >
            {showForm ? "Cancel" : "+ Upload Payment"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 mb-4 border-bad/40">
          <p className="text-sm text-bad">{error}</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          {editingId && (
            <p className="text-xs font-semibold uppercase tracking-wide text-seal">Editing existing payment record</p>
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
              <label className="label-field">Payment date</label>
              <input
                required
                type="date"
                className="input-field"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
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
              <label className="label-field">Bank deposited to</label>
              <input
                className="input-field"
                placeholder="e.g. Security Bank"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Reference number (optional)</label>
              <input
                className="input-field"
                value={form.reference_number}
                onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label-field">Notes (optional)</label>
            <input
              className="input-field"
              placeholder="e.g. Partial payment, GCash to bank transfer, etc."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <FileUploadField
            bucket="payment-records"
            label="Deposit slip / proof of payment"
            existingPath={editingExistingFile}
            onUploaded={setFilePath}
            accept="image/*,.pdf"
          />
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving…" : editingId ? "Update record" : "Save payment record"}
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

      {/* Report panel */}
      {showReport && (
        <div className="card p-5 mb-6">
          <h2 className="font-display text-lg font-semibold text-ink mb-4">Payment Report</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="label-field">From</label>
              <input type="date" className="input-field" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
            </div>
            <div>
              <label className="label-field">To</label>
              <input type="date" className="input-field" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button onClick={exportCsv} className="btn-secondary text-sm w-full">Export CSV</button>
            </div>
          </div>

          {report && (
            <>
              <div className="rounded-md bg-paper px-4 py-3 mb-5">
                <p className="text-xs text-inkmuted uppercase tracking-wide">Total collected in range</p>
                <p className="font-display text-2xl font-semibold text-good">₱{report.total.toLocaleString()}</p>
                <p className="text-xs text-inkmuted mt-1">{report.list.length} payment record(s)</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-inkmuted mb-2">By Bank</h3>
                  <ul className="divide-y divide-border">
                    {report.byBank.map(([bank, amt]) => (
                      <li key={bank} className="py-2 flex justify-between text-sm">
                        <span className="text-ink">{bank}</span>
                        <span className="font-medium">₱{amt.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-inkmuted mb-2">By Tenant</h3>
                  <ul className="divide-y divide-border">
                    {report.byTenant.map(([tenant, amt]) => (
                      <li key={tenant} className="py-2 flex justify-between text-sm">
                        <span className="text-ink">{tenant}</span>
                        <span className="font-medium">₱{amt.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">Total Collected</p>
          <p className="font-display text-2xl font-semibold mt-1 text-good">₱{overall.total.toLocaleString()}</p>
          <p className="text-xs text-inkmuted mt-1">{overall.count} record(s)</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">This Month</p>
          <p className="font-display text-2xl font-semibold mt-1 text-ink">₱{overall.thisMonthTotal.toLocaleString()}</p>
          <p className="text-xs text-inkmuted mt-1">{overall.thisMonthCount} record(s)</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">Banks Used</p>
          <p className="font-display text-2xl font-semibold mt-1 text-ink">{overall.banks}</p>
          <p className="text-xs text-inkmuted mt-1">Distinct banks on file</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">Total Records</p>
          <p className="font-display text-2xl font-semibold mt-1 text-ink">{records.length}</p>
          <p className="text-xs text-inkmuted mt-1">All time</p>
        </div>
      </div>

      {/* Filter panel */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label-field">Select Tenant</label>
            <select className="input-field" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
              <option value="__all__">All tenants</option>
              {units.map((u) => (
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
              <option value="date_desc">Payment date (latest first)</option>
              <option value="date_asc">Payment date (earliest first)</option>
              <option value="amount_desc">Amount (highest first)</option>
              <option value="amount_asc">Amount (lowest first)</option>
            </select>
          </div>
        </div>
        <input
          type="text"
          className="input-field"
          placeholder="Search tenant, bank, reference, or amount…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-display font-semibold text-ink">Payment Records ({filtered.length})</h2>
          <p className="text-sm font-semibold text-ink">
            Total: ₱{filtered.reduce((s, r) => s + Number(r.amount), 0).toLocaleString()}
          </p>
        </div>

        {paginated.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No payment records match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-inkmuted">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-2 py-2">Tenant / Unit</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Bank</th>
                  <th className="px-2 py-2">Reference</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((r) => (
                  <PaymentRow key={r.id} r={r} onEdit={() => startEdit(r)} onDelete={() => handleDelete(r.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-inkmuted">
              Showing {(pageSafe - 1) * rowsPerPage + 1} to {Math.min(pageSafe * rowsPerPage, filtered.length)} of {filtered.length} entries
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-inkmuted">Rows per page</span>
                <select className="input-field text-xs py-1" value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1} className="btn-secondary text-xs px-2 py-1 disabled:opacity-40">‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, pageSafe - 3), pageSafe + 2)
                  .map((n) => (
                    <button key={n} onClick={() => setPage(n)} className={`text-xs px-2.5 py-1 rounded-md ${n === pageSafe ? "bg-ink text-paper" : "text-ink hover:bg-paper"}`}>
                      {n}
                    </button>
                  ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe === totalPages} className="btn-secondary text-xs px-2 py-1 disabled:opacity-40">›</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentRow({ r, onEdit, onDelete }: { r: PaymentRecord; onEdit: () => void; onDelete: () => void }) {
  async function handleView() {
    const newTab = window.open("", "_blank");
    const url = await getSignedUrl("payment-records", r.deposit_slip_url);
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
    <tr className="hover:bg-paper/60">
      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-inkmuted">{r.payment_date}</td>
      <td className="px-2 py-3">
        <span className="font-medium text-ink">{r.units?.unit_name}</span>
        {r.tenants?.full_name ? <span className="text-inkmuted"> — {r.tenants.full_name}</span> : ""}
        {r.notes ? <p className="text-xs text-inkmuted mt-0.5">{r.notes}</p> : null}
      </td>
      <td className="px-2 py-3 font-medium">₱{Number(r.amount).toLocaleString()}</td>
      <td className="px-2 py-3 text-inkmuted">{r.bank_name || "—"}</td>
      <td className="px-2 py-3 text-inkmuted">{r.reference_number || "—"}</td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={handleView} className="rounded-md border border-seal/40 text-seal text-xs px-2 py-1 hover:bg-seal/10">View</button>
          <button onClick={onEdit} className="rounded-md border border-warn/40 text-warn text-xs px-2 py-1 hover:bg-warn/10">Edit</button>
          <button onClick={onDelete} className="rounded-md bg-bad text-white text-xs px-2 py-1 hover:opacity-90">Delete</button>
        </div>
      </td>
    </tr>
  );
}
