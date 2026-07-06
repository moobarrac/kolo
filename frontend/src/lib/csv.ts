import { parseToMinor } from "@kolo/shared";

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes (""),
// embedded commas/newlines, and CRLF. Returns a grid of trimmed-of-BOM rows.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

export type DateFormat = "ymd" | "dmy" | "mdy";

// Parse a date cell into ISO YYYY-MM-DD, or null if it can't be read.
export function parseDate(raw: string, fmt: DateFormat): string | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(/[/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [p0, p1, p2] = parts as [string, string, string];
  let y: string, m: string, d: string;
  if (fmt === "ymd") { y = p0; m = p1; d = p2; }
  else if (fmt === "dmy") { d = p0; m = p1; y = p2; }
  else { m = p0; d = p1; y = p2; }
  if (y.length === 2) y = `20${y}`;
  const yy = Number(y), mm = Number(m), dd = Number(d);
  if (!yy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yy.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

// Clean a money cell (strip symbols/thousands separators, read parentheses or a
// leading minus as negative) and convert to signed minor units.
export function parseAmount(raw: string, currency: string): { minor: bigint; negative: boolean } | null {
  const t = raw.trim();
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || /-/.test(t) || /\bDR\b/i.test(t);
  const cleaned = t.replace(/[(),\s]/g, "").replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return null;
  try {
    const minor = parseToMinor(cleaned, currency);
    if (minor === 0n) return null;
    return { minor, negative };
  } catch {
    return null;
  }
}
