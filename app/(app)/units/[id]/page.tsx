"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import { StatusBadge } from "@/components/StatusBadge";

// Local, self-contained types — this page doesn't depend on the shared
// types file, so it can't break if that file's shape has since changed.
interface Unit {
  id: string;
  unit_name: string;
  unit_type: string;
  address: string | null;
  status: string;
  monthly_rent: number | null;
  start_date: string | null;
  billing_day: string | null;
  contact_person: string | null;
  contact_number: string | null;
  photo_url: string | null;
  notes: string | null;
}
interface Tenant {
  id: string;
  full_name: string;
  contact_number: string | null;
  email: string | null;
}
interface Contract {
  id: string;
  status: string;
  end_date: string;
  monthly_rent: number;
  payment_mode: string | null;
  payment_notes: string | null;
}
interface Maintenance {
  id: string;
  repair_date: string;
  repair_type: string;
  description: string | null;
  cost: number;
  before_photo_url: string | null;
  after_photo_url: string | null;
  materials_receipt_url: string | null;
}
interface InsurancePolicy {
  id: string;
  insurer: string | null;
  policy_number: string | null;
  amount: number | null;
  issued_date: string | null;
  expiry_date: string | null;
  file_url: string;
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cheque_annual: "Post-dated Cheque (Annual)",
  cheque_monthly: "Cheque (Monthly pickup)",
  bank_transfer: "Bank Transfer / Online",
  cash: "Cash",
  other: "Other",
};

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [insurance, setInsurance] = useState<InsurancePolicy[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    unit_name: "",
    unit_type: "residential",
    address: "",
    status: "vacant",
    monthly_rent: "",
    start_date: "",
    billing_day: "",
    contact_person: "",
    contact_number: "",
    notes: "",
  });
  const [editPhotoPath, setEditPhotoPath] = useState<string | null>(null);

  const [maintForm, setMaintForm] = useState({ repair_type: "", description: "", cost: "", repair_date: "" });
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  const [insForm, setInsForm] = useState({ insurer: "", policy_number: "", amount: "", issued_date: "", expiry_date: "" });
  const [insFilePath, setInsFilePath] = useState<string | null>(null);

  async function loadAll() {
    const { data: u } = await supabase.from("units").select("*").eq("id", id).single();
    setUnit(u);
    if (u) {
      setEditForm({
        unit_name: u.unit_name ?? "",
        unit_type: u.unit_type ?? "residential",
        address: u.address ?? "",
        status: u.status ?? "vacant",
        monthly_rent: u.monthly_rent != null ? String(u.monthly_rent) : "",
        start_date: u.start_date ?? "",
        billing_day: u.billing_day ?? "",
        contact_person: u.contact_person ?? "",
        contact_number: u.contact_number ?? "",
        notes: u.notes ?? "",
      });
    }
    if (u?.photo_url) setPhotoUrl(await getSignedUrl("unit-photos", u.photo_url));

    const { data: t } = await supabase.from("tenants").select("*").eq("unit_id", id).eq("active", true).maybeSingle();
    setTenant(t);

    const { data: c } = await supabase
      .from("contracts")
      .select("*")
      .eq("unit_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setContract(c);

    const { data: m } = await supabase
      .from("maintenance")
      .select("*")
      .eq("unit_id", id)
      .order("repair_date", { ascending: false });
    setMaintenance(m ?? []);

    const { data: ins } = await supabase
      .from("insurance_policies")
      .select("*")
      .eq("unit_id", id)
      .order("expiry_date", { ascending: true });
    setInsurance(ins ?? []);
  }

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const updates: any = { ...editForm };
    if (editPhotoPath) updates.photo_url = editPhotoPath;
    await supabase.from("units").update(updates).eq("id", id);
    setShowEditForm(false);
    setSaving(false);
    loadAll();
  }

  async function handleDelete() {
    setDeleting(true);
    await supabase.from("units").delete().eq("id", id);
    router.push("/units");
  }

  async function handleAddMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("maintenance").insert({
      unit_id: id,
      repair_type: maintForm.repair_type,
      description: maintForm.description,
      cost: parseFloat(maintForm.cost) || 0,
      repair_date: maintForm.repair_date || new Date().toISOString().slice(0, 10),
      before_photo_url: beforePhoto,
      after_photo_url: afterPhoto,
      materials_receipt_url: receiptPath,
    });
    setMaintForm({ repair_type: "", description: "", cost: "", repair_date: "" });
    setBeforePhoto(null);
    setAfterPhoto(null);
    setReceiptPath(null);
    setShowMaintForm(false);
    setSaving(false);
    loadAll();
  }

  async function handleAddInsurance(e: React.FormEvent) {
    e.preventDefault();
    if (!insFilePath) return;
    setSaving(true);
    setError(null);
    const { error: insertErr } = await supabase.from("insurance_policies").insert({
      unit_id: id,
      insurer: insForm.insurer || null,
      policy_number: insForm.policy_number || null,
      amount: insForm.amount ? parseFloat(insForm.amount) : null,
      issued_date: insForm.issued_date || null,
      expiry_date: insForm.expiry_date || null,
      file_url: insFilePath,
    });
    setSaving(false);
    if (insertErr) {
      setError("Couldn't save this policy: " + insertErr.message);
      return;
    }
    setInsForm({ insurer: "", policy_number: "", amount: "", issued_date: "", expiry_date: "" });
    setInsFilePath(null);
    setShowInsuranceForm(false);
    loadAll();
  }

  async function handleDeleteInsurance(policyId: string) {
    if (!confirm("Delete this insurance policy?")) return;
    await supabase.from("insurance_policies").delete().eq("id", policyId);
    loadAll();
  }

  if (!unit) return <p className="text-sm text-inkmuted">Loading…</p>;

  const totalMaintCost = maintenance.reduce((sum, m) => sum + Number(m.cost), 0);
  const today = new Date().toISOString().slice(0, 10);
  const in60Days = new Date();
  in60Days.setDate(in60Days.getDate() + 60);
  const in60DaysStr = in60Days.toISOString().slice(0, 10);

  function insuranceStatus(expiry: string | null) {
    if (!expiry) return null;
    if (expiry < today) return { label: "Expired", cls: "stamp-bad" };
    if (expiry <= in60DaysStr) return { label: "Expiring Soon", cls: "stamp-warn" };
    return { label: "Valid", cls: "stamp-good" };
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{unit.unit_name}</h1>
          <p className="text-sm text-inkmuted mt-1 uppercase tracking-wide">{unit.unit_type} · {unit.address}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={unit.status} />
          <button onClick={() => setShowEditForm((s) => !s)} className="btn-secondary text-xs">
            {showEditForm ? "Cancel" : "Edit"}
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-bad">Delete this unit and its records?</span>
              <button onClick={handleDelete} disabled={deleting} className="text-xs font-medium text-bad underline">
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="text-xs text-inkmuted underline">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="text-xs font-medium text-bad underline">
              Delete
            </button>
          )}
        </div>
      </div>

      {showEditForm && (
        <form onSubmit={handleSaveEdit} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Unit name / number</label>
              <input
                required
                className="input-field"
                value={editForm.unit_name}
                onChange={(e) => setEditForm({ ...editForm, unit_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Type</label>
              <select
                className="input-field"
                value={editForm.unit_type}
                onChange={(e) => setEditForm({ ...editForm, unit_type: e.target.value })}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Address</label>
              <input
                className="input-field"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Status</label>
              <select
                className="input-field"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
                <option value="under_maintenance">Under Maintenance</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Monthly rent (₱)</label>
              <input
                type="number"
                className="input-field"
                value={editForm.monthly_rent}
                onChange={(e) => setEditForm({ ...editForm, monthly_rent: e.target.value })}
              />
            </div>
            <FileUploadField
              bucket="unit-photos"
              label="Photo of the unit"
              existingPath={unit.photo_url}
              onUploaded={setEditPhotoPath}
              accept="image/*"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Date started (lease start)</label>
              <input
                type="date"
                className="input-field"
                value={editForm.start_date}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Billing date (day of month, e.g. 5)</label>
              <input
                type="number"
                min="1"
                max="31"
                className="input-field"
                value={editForm.billing_day}
                onChange={(e) => setEditForm({ ...editForm, billing_day: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Contact person</label>
              <input
                className="input-field"
                value={editForm.contact_person}
                onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Contact number</label>
              <input
                className="input-field"
                value={editForm.contact_number}
                onChange={(e) => setEditForm({ ...editForm, contact_number: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label-field">Notes</label>
            <textarea
              className="input-field"
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="card p-4 col-span-1">
          <p className="label-field">Unit photo</p>
          {photoUrl ? (
            <img src={photoUrl} alt={unit.unit_name} className="rounded-md w-full h-40 object-cover" />
          ) : (
            <div className="rounded-md w-full h-40 bg-paper flex items-center justify-center text-xs text-inkmuted">
              No photo uploaded
            </div>
          )}
        </div>

        <div className="card p-4 col-span-1">
          <p className="label-field">Current tenant</p>
          {tenant ? (
            <>
              <p className="font-medium text-ink">{tenant.full_name}</p>
              <p className="text-sm text-inkmuted">{tenant.contact_number}</p>
              <p className="text-sm text-inkmuted">{tenant.email}</p>
            </>
          ) : (
            <p className="text-sm text-inkmuted">No active tenant assigned. Add one from the Billing tab.</p>
          )}
          {(unit.contact_person || unit.contact_number) && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs text-inkmuted uppercase tracking-wide">Unit contact</p>
              <p className="text-sm text-inkmuted">{unit.contact_person} {unit.contact_number ? `· ${unit.contact_number}` : ""}</p>
            </div>
          )}
        </div>

        <div className="card p-4 col-span-1">
          <p className="label-field">Contract</p>
          {contract ? (
            <>
              <div className="mb-1"><StatusBadge status={contract.status} /></div>
              <p className="text-sm text-inkmuted">Ends {contract.end_date}</p>
              <p className="text-sm text-inkmuted font-mono">₱{Number(contract.monthly_rent).toLocaleString()}/mo</p>
              {contract.payment_mode && (
                <p className="text-xs text-inkmuted mt-1">
                  {PAYMENT_MODE_LABELS[contract.payment_mode] || contract.payment_mode}
                  {contract.payment_notes ? ` — ${contract.payment_notes}` : ""}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-inkmuted">No contract on file. Add one from the Contracts tab.</p>
          )}
        </div>
      </div>

      {/* Insurance */}
      <div className="card p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Insurance</h2>
          <button onClick={() => setShowInsuranceForm((s) => !s)} className="btn-secondary text-sm">
            {showInsuranceForm ? "Cancel" : "+ Add Policy"}
          </button>
        </div>

        {error && <p className="text-sm text-bad mb-3">{error}</p>}

        {showInsuranceForm && (
          <form onSubmit={handleAddInsurance} className="border border-border rounded-md p-4 mb-4 space-y-4 bg-paper/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-field">Insurer / company</label>
                <input
                  className="input-field"
                  placeholder="e.g. Malayan Insurance"
                  value={insForm.insurer}
                  onChange={(e) => setInsForm({ ...insForm, insurer: e.target.value })}
                />
              </div>
              <div>
                <label className="label-field">Policy number</label>
                <input
                  className="input-field"
                  value={insForm.policy_number}
                  onChange={(e) => setInsForm({ ...insForm, policy_number: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label-field">Amount (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={insForm.amount}
                  onChange={(e) => setInsForm({ ...insForm, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="label-field">Issued date</label>
                <input
                  type="date"
                  className="input-field"
                  value={insForm.issued_date}
                  onChange={(e) => setInsForm({ ...insForm, issued_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label-field">Expiry date</label>
                <input
                  type="date"
                  className="input-field"
                  value={insForm.expiry_date}
                  onChange={(e) => setInsForm({ ...insForm, expiry_date: e.target.value })}
                />
              </div>
            </div>
            <FileUploadField bucket="insurance" label="Policy document" onUploaded={setInsFilePath} />
            <button type="submit" disabled={saving || !insFilePath} className="btn-primary text-sm">
              {saving ? "Saving…" : "Save policy"}
            </button>
          </form>
        )}

        {insurance.length === 0 ? (
          <p className="text-sm text-inkmuted">No insurance policy on file for this unit yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {insurance.map((p) => {
              const status = insuranceStatus(p.expiry_date);
              return (
                <li key={p.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-ink text-sm">{p.insurer || "Insurance policy"}</p>
                    <p className="text-xs text-inkmuted mt-0.5">
                      {p.policy_number ? `Policy #${p.policy_number} · ` : ""}
                      {p.amount ? `₱${Number(p.amount).toLocaleString()} · ` : ""}
                      {p.issued_date ? `Issued ${p.issued_date}` : ""}
                      {p.expiry_date ? ` · Expires ${p.expiry_date}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {status && <span className={status.cls}>{status.label}</span>}
                    <InsuranceViewButton path={p.file_url} />
                    <button onClick={() => handleDeleteInsurance(p.id)} className="text-xs text-bad underline">
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Maintenance history</h2>
            <p className="text-xs text-inkmuted mt-0.5">Total spent: ₱{totalMaintCost.toLocaleString()}</p>
          </div>
          <button onClick={() => setShowMaintForm((s) => !s)} className="btn-secondary text-sm">
            {showMaintForm ? "Cancel" : "+ Log repair"}
          </button>
        </div>

        {showMaintForm && (
          <form onSubmit={handleAddMaintenance} className="border border-border rounded-md p-4 mb-4 space-y-4 bg-paper/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-field">Repair type</label>
                <input
                  required
                  className="input-field"
                  placeholder="e.g. Plumbing, Repainting"
                  value={maintForm.repair_type}
                  onChange={(e) => setMaintForm({ ...maintForm, repair_type: e.target.value })}
                />
              </div>
              <div>
                <label className="label-field">Cost of materials (₱)</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={maintForm.cost}
                  onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label-field">Description</label>
              <textarea
                className="input-field"
                rows={2}
                value={maintForm.description}
                onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FileUploadField bucket="maintenance-files" label="Before photo" onUploaded={setBeforePhoto} accept="image/*" />
              <FileUploadField bucket="maintenance-files" label="After photo" onUploaded={setAfterPhoto} accept="image/*" />
              <FileUploadField bucket="maintenance-files" label="Materials receipt" onUploaded={setReceiptPath} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving…" : "Save repair log"}
            </button>
          </form>
        )}

        {maintenance.length === 0 ? (
          <p className="text-sm text-inkmuted">No maintenance logged for this unit yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {maintenance.map((m) => (
              <MaintenanceRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MaintenanceRow({ m }: { m: Maintenance }) {
  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-ink text-sm">{m.repair_type}</p>
          <p className="text-xs text-inkmuted">{m.repair_date} · {m.description}</p>
        </div>
        <p className="font-mono text-sm text-ink">₱{Number(m.cost).toLocaleString()}</p>
      </div>
      <div className="flex gap-3 mt-2">
        {m.before_photo_url && <FileLink bucket="maintenance-files" path={m.before_photo_url} label="Before photo" />}
        {m.after_photo_url && <FileLink bucket="maintenance-files" path={m.after_photo_url} label="After photo" />}
        {m.materials_receipt_url && <FileLink bucket="maintenance-files" path={m.materials_receipt_url} label="Receipt" />}
      </div>
    </li>
  );
}

function FileLink({ bucket, path, label }: { bucket: string; path: string; label: string }) {
  async function handleClick() {
    const url = await getSignedUrl(bucket, path);
    if (url) window.open(url, "_blank");
  }
  return (
    <button onClick={handleClick} className="text-xs text-seal underline">
      {label}
    </button>
  );
}

function InsuranceViewButton({ path }: { path: string }) {
  async function handleClick() {
    const newTab = window.open("", "_blank");
    const url = await getSignedUrl("insurance", path);
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
    <button onClick={handleClick} className="text-xs text-seal underline">
      View policy
    </button>
  );
}
