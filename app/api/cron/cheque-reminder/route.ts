// app/api/cron/cheque-reminder/route.ts
// Araw-araw na email reminder para sa mga chekeng hindi pa nade-deposit.
// Tinatawag ng Vercel Cron (tingnan ang vercel.json) tuwing 8 AM (PH time).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ================================================================
// I-ADJUST DITO kung iba ang pangalan ng table/columns sa Supabase mo
// ================================================================
const CONFIG = {
  table: "cheques",
  dateColumn: "cheque_date", // petsa ng cheke (kailan puwede i-deposit)
  statusColumn: "status",
  pendingStatus: "pending", // status ng chekeng hindi pa nade-deposit
  numberColumn: "cheque_number",
  bankColumn: "bank_name",
  amountColumn: "amount",
  // "tenants(full_name)" = kunin ang pangalan ng tenant mula sa tenants table
  select: "id, cheque_number, bank_name, amount, cheque_date, status, tenants(full_name)",
  daysAhead: 1, // isama rin ang mga chekeng due BUKAS bilang heads-up
  appUrl: "https://jortizlessor.vercel.app",
};
// ================================================================

type Row = Record<string, unknown>;

function getText(r: Row, key: string): string {
  return r[key] == null ? "—" : String(r[key]);
}

function getTenant(r: Row): string {
  const t = r.tenants as { full_name?: string } | { full_name?: string }[] | null | undefined;
  if (Array.isArray(t)) return t[0]?.full_name ?? "—";
  return t?.full_name ?? "—";
}

function toNumber(r: Row): number {
  const n = Number(r[CONFIG.amountColumn]);
  return Number.isFinite(n) ? n : 0;
}

function peso(n: number): string {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Petsa ngayon sa Manila timezone, format YYYY-MM-DD
function manilaDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
}

function prettyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function esc(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

const dateOf = (r: Row) => getText(r, CONFIG.dateColumn).slice(0, 10);

function htmlSection(title: string, color: string, rows: Row[]): string {
  if (rows.length === 0) return "";
  const td = 'style="padding:6px 10px;border-bottom:1px solid #eee"';
  const th = 'style="padding:6px 10px;text-align:left;background:#f5f5f5;border-bottom:1px solid #ddd"';
  const body = rows
    .map(
      (r) => `<tr>
        <td ${td}>${esc(prettyDate(dateOf(r)))}</td>
        <td ${td}>${esc(getTenant(r))}</td>
        <td ${td}>${esc(getText(r, CONFIG.bankColumn))}</td>
        <td ${td}>${esc(getText(r, CONFIG.numberColumn))}</td>
        <td ${td} align="right">${esc(peso(toNumber(r)))}</td>
      </tr>`
    )
    .join("");
  return `
    <h3 style="color:${color};margin:20px 0 8px">${title} (${rows.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr>
        <th ${th}>Petsa</th><th ${th}>Tenant</th><th ${th}>Bank</th><th ${th}>Cheque #</th><th ${th}>Amount</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function textSection(title: string, rows: Row[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map(
    (r) =>
      `- ${prettyDate(dateOf(r))} | ${getTenant(r)} | ${getText(r, CONFIG.bankColumn)} #${getText(
        r,
        CONFIG.numberColumn
      )} | ${peso(toNumber(r))}`
  );
  return `${title} (${rows.length})\n${lines.join("\n")}\n\n`;
}

export async function GET(req: Request) {
  // 1) Security: Vercel Cron ay nagpapadala ng "Bearer CRON_SECRET".
  //    Para sa manual test, puwede rin ang ?key=CRON_SECRET sa URL.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Kunin ang mga chekeng hindi pa tapos
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const today = manilaDate(0);
  const limit = manilaDate(CONFIG.daysAhead);
  const { data, error } = await supabase
    .from(CONFIG.table)
    .select(CONFIG.select)
    .eq(CONFIG.statusColumn, CONFIG.pendingStatus)
    .lte(CONFIG.dateColumn, limit)
    .order(CONFIG.dateColumn, { ascending: true });

  if (error) {
    console.error("Cheque reminder query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) {
    return NextResponse.json({ sent: false, message: "Walang chekeng kailangang i-deposit." });
  }

  const overdue = rows.filter((r) => dateOf(r) < today);
  const dueToday = rows.filter((r) => dateOf(r) === today);
  const tomorrow = rows.filter((r) => dateOf(r) > today);
  const actionable = [...overdue, ...dueToday];
  const total = actionable.reduce((sum, r) => sum + toNumber(r), 0);

  // 3) Buuin ang email
  const subject =
    actionable.length > 0
      ? `[Paalala] ${actionable.length} cheke na kailangang i-deposit – ${prettyDate(today)}`
      : `[Heads-up] ${tomorrow.length} cheke na due bukas – ${prettyDate(today)}`;

  const html = `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:680px">
    <p>Magandang umaga!</p>
    <p>Ito ang mga chekeng <b>naka-pending pa</b> sa system (hindi pa nade-deposit).</p>
    ${actionable.length > 0 ? `<p><b>Kabuuang ide-deposit ngayon: ${esc(peso(total))}</b></p>` : ""}
    ${htmlSection("Lampas na sa petsa", "#c0392b", overdue)}
    ${htmlSection("Due ngayong araw", "#d35400", dueToday)}
    ${htmlSection("Due bukas (heads-up)", "#2c7be5", tomorrow)}
    <p style="margin-top:20px">Pagka-deposit, i-<b>archive</b> agad ang cheke sa <b>Cheques</b> tab para hindi na ito lumabas sa susunod na reminder:<br>
      <a href="${CONFIG.appUrl}">${CONFIG.appUrl}</a></p>
    <p style="color:#888;font-size:12px">Automatic na email ito mula sa Juan Ortiz Lessor system.</p>
  </div>`;

  const text =
    `Magandang umaga!\n\nIto ang mga chekeng naka-pending pa sa system (hindi pa nade-deposit).\n` +
    (actionable.length > 0 ? `Kabuuang ide-deposit ngayon: ${peso(total)}\n\n` : "\n") +
    textSection("LAMPAS NA SA PETSA", overdue) +
    textSection("DUE NGAYONG ARAW", dueToday) +
    textSection("DUE BUKAS (heads-up)", tomorrow) +
    `Pagka-deposit, i-ARCHIVE agad ang cheke sa Cheques tab: ${CONFIG.appUrl}\n`;

  // 4) Ipadala gamit ang Gmail
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const to = process.env.REMINDER_TO;
  if (!user || !pass || !to) {
    return NextResponse.json(
      { error: "Kulang ang email settings (GMAIL_USER, GMAIL_APP_PASSWORD, REMINDER_TO)." },
      { status: 500 }
    );
  }

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });

  try {
    await transporter.sendMail({
      from: `"Juan Ortiz Lessor" <${user}>`,
      to,
      cc: process.env.REMINDER_CC || undefined,
      subject,
      html,
      text,
    });
  } catch (e) {
    console.error("Email send error:", e);
    return NextResponse.json({ error: "Hindi naipadala ang email", detail: String(e) }, { status: 500 });
  }

  return NextResponse.json({
    sent: true,
    overdue: overdue.length,
    today: dueToday.length,
    tomorrow: tomorrow.length,
  });
}
