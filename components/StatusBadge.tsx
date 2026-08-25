export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    paid: { cls: "stamp-good", label: "Paid" },
    pending: { cls: "stamp-warn", label: "Pending" },
    overdue: { cls: "stamp-bad", label: "Overdue" },
    active: { cls: "stamp-good", label: "Active" },
    expiring_soon: { cls: "stamp-warn", label: "Expiring Soon" },
    expired: { cls: "stamp-bad", label: "Expired" },
    terminated: { cls: "stamp-neutral", label: "Terminated" },
    occupied: { cls: "stamp-good", label: "Occupied" },
    vacant: { cls: "stamp-neutral", label: "Vacant" },
    under_maintenance: { cls: "stamp-warn", label: "Under Maintenance" },
  };
  const entry = map[status] ?? { cls: "stamp-neutral", label: status };
  return <span className={entry.cls}>{entry.label}</span>;
}
