"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/units", label: "Units", icon: "▤" },
  { href: "/billing", label: "Billing", icon: "₱" },
  { href: "/contracts", label: "Contracts", icon: "✎" },
  { href: "/maintenance", label: "Maintenance", icon: "⚒" },
  { href: "/permits", label: "Permits", icon: "◍" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card min-h-screen flex flex-col">
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full border-2 border-seal flex items-center justify-center shrink-0">
            <span className="font-display text-sm text-seal">JO</span>
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-ink leading-tight">Juan Ortiz</p>
            <p className="text-xs text-inkmuted leading-tight">Lessor</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-ink text-paper" : "text-ink hover:bg-paper"
              }`}
            >
              <span className="w-4 text-center opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <button onClick={handleLogout} className="btn-secondary w-full text-sm">
          Sign out
        </button>
      </div>
    </aside>
  );
}
