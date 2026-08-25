"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import type { Permit, PermitType, Unit } from "@/types";
import { PERMIT_LABELS } from "@/types";

export default function PermitsPage() {
  const supabase = createClient();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("");

  const [form, setForm] = useState({
    permit_type: "mayors_permit" as PermitType,
    custom_type: "",
    unit_id: "",
    label: "",
    issued_date: "",
    expiry_date: "",
  });

  async function loadData() {
    const { data: p, error: loadErr } = await supabase
      .from("permits")
      .select("*, units(*)")
      .order("expiry_date", { ascending: true });
    if (loadErr) {
      setError("Couldn't load documents: " + loadErr.message);
    } else {
      setPermits((p as any) ?? []);
    }
    const { data: u } = await supabase.from("units").select("*").order("unit_name");
    setUnits(u ?? []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filePath) return;
    const isOther = form.permit_type === "__other__";
    if (isOther && !form.custom_type.trim()) return;
    setSaving(true);
    setError(null);
    const finalType = isOther ? form.custom_type.trim() : form.permit_type;
    const { error: insertErr } = await supabase.from("permits").insert({
      permit_type: finalType,
      unit_id: form.unit_id || null,
      label: form.label || null,
      issued_date: form.issued_date || null,
      expiry_date: form.expiry_date || null,
      file_url: filePath,
    });
    setSaving(false);
    if (insertErr) {
      setError("Couldn't save this document: " + insertErr.message);
      return;
    }
    setForm({ permit_type: "mayors_permit", custom_type: "", unit_id: "", label: "", issued_date: "", expiry_date: "" });
    setFilePath(null);
    setShowForm(false);
    loadData();
  }

  const today = new Date().toISOString().slice(0, 10);

  const filteredPermits = permits.filter((p) => {
    if (filterType && p.permit_type !== filterType) return false;
    if (searchText.trim()) {
      const haystack = [
        PERMIT_LABELS[p.permit_type] || p.permit_type,
        p.label,
        p.units?.unit_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchText.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Permits &amp; Documents</h1>
          <p className="text-sm text-inkmuted mt-1">Business permits, tax declarations, and property clearances.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ Upload Document"}
        </button>
      </div>

      {error && (
        <div className="card p-4 mb-4 border-bad/40">
          <p className="text-sm text-bad">{error}</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Document type</label>
              <select
                className="input-field"
                value={form.permit_type}
                onChange={(e) => setForm({ ...form, permit_type: e.target.value as PermitType })}
              >
                {Object.entries(PERMIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
                <option value="__other__">Other (type your own)…</option>
              </select>
            </div>
            <div>
              <label className="label-field">Related unit (optional)</label>
              <select
                className="input-field"
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Business-wide / not unit specific</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.unit_name}</option>
                ))}
              </select>
            </div>
          </div>
          {form.permit_type === "__other__" && (
            <div style={{ marginBottom: "14px" }}>
              <label className="label-field">Custom document type name</label>
              <input
                required
                className="input-field"
                placeholder="e.g. Environmental Compliance Certificate"
                value={form.custom_type}
                onChange={(e) => setForm({ ...form, custom_type: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="label-field">Custom label (optional)</label>
            <input
              className="input-field"
              placeholder="e.g. Renewed 2026"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Issued date</label>
              <input
                type="date"
                className="input-field"
                value={form.issued_date}
                onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Expiry date</label>
              <input
                type="date"
                className="input-field"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              />
            </div>
          </div>
          <FileUploadField bucket="permits" label="Document file" onUploaded={setFilePath} />
          <button type="submit" disabled={saving || !filePath} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save document"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <input
          type="text"
          className="input-field"
          placeholder="Search by name, unit, or label…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select
          className="input-field"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All document types</option>
          {Array.from(new Set(permits.map((p) => p.permit_type))).map((t) => (
            <option key={t} value={t}>{PERMIT_LABELS[t] || t}</option>
          ))}
        </select>
      </div>

      <div className="card divide-y divide-border">
        {permits.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No documents uploaded yet.</p>
        ) : filteredPermits.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No documents match your search.</p>
        ) : (
          filteredPermits.map((p) => {
            const expiringSoon = p.expiry_date && p.expiry_date <= today;
            return (
              <div key={p.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink text-sm">
                    {PERMIT_LABELS[p.permit_type] || p.permit_type}
                    {p.label ? ` — ${p.label}` : ""}
                    {p.units?.unit_name ? ` (${p.units.unit_name})` : ""}
                  </p>
                  <p className="text-xs text-inkmuted mt-0.5">
                    {p.issued_date ? `Issued ${p.issued_date}` : ""}
                    {p.expiry_date ? ` · Expires ${p.expiry_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {expiringSoon && <span className="stamp-bad">Expired</span>}
                  <PermitViewButton path={p.file_url} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PermitViewButton({ path }: { path: string }) {
  async function handleClick() {
    if (!path) {
      alert("This document has no file attached — it may not have uploaded correctly. Try re-uploading it.");
      return;
    }
    const url = await getSignedUrl("permits", path);
    if (url) {
      window.open(url, "_blank");
    } else {
      alert("Couldn't open this file. It may have been removed from storage, or the link is broken — try re-uploading it.");
    }
  }
  return (
    <button onClick={handleClick} className="text-xs text-seal underline">
      View document
    </button>
  );
}
