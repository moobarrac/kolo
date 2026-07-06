import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { money } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { parseCsv, parseDate, parseAmount, type DateFormat } from "@/lib/csv";
import { useUserAccounts, useImportEntries, useProfile, type AccountRow, type ImportRow } from "@/lib/data";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm outline-none focus:border-forest";
const MONEY_SUBS = new Set(["cash", "bank", "mobile_money"]);

// CSV / bank-statement import. Map your file's columns once, preview how every row
// will land, then import — each row posts a balanced income/expense entry against
// the chosen account (idempotent, so re-importing the same file is safe).
export function ImportPage() {
  const { data: profile } = useProfile();
  const base = profile?.base_currency ?? "NGN";
  const { data: accounts } = useUserAccounts();
  const doImport = useImportEntries();

  const targets = (accounts ?? []).filter(
    (a: AccountRow) => a.type === "asset" && !!a.subtype && MONEY_SUBS.has(a.subtype) && a.currency === base,
  );
  const expenseCats = (accounts ?? []).filter((a) => a.type === "expense");
  const incomeCats = (accounts ?? []).filter((a) => a.type === "income");

  const [accountId, setAccountId] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [dateCol, setDateCol] = useState(0);
  const [descCol, setDescCol] = useState(1);
  const [mode, setMode] = useState<"single" | "split">("single");
  const [amountCol, setAmountCol] = useState(2);
  const [inCol, setInCol] = useState(2);
  const [outCol, setOutCol] = useState(3);
  const [dateFmt, setDateFmt] = useState<DateFormat>("ymd");
  const [expenseCat, setExpenseCat] = useState("");
  const [incomeCat, setIncomeCat] = useState("");

  const account = targets.find((a) => a.id === accountId) ?? targets[0] ?? null;
  const grid = useMemo(() => parseCsv(raw), [raw]);
  const header = grid[0] ?? [];
  const dataRows = hasHeader ? grid.slice(1) : grid;
  const colCount = grid.reduce((n, r) => Math.max(n, r.length), 0);
  const colLabel = (i: number) => (hasHeader && header[i]?.trim()) || `Column ${i + 1}`;

  const expCatId = expenseCat || expenseCats[0]?.id || "";
  const incCatId = incomeCat || incomeCats[0]?.id || "";

  // Turn each data row into an import row (or an error marker for the preview).
  const parsed = useMemo(() => {
    return dataRows.map((cells) => {
      const date = parseDate(cells[dateCol] ?? "", dateFmt);
      const description = (cells[descCol] ?? "").trim();
      let direction: "in" | "out" | null = null;
      let amountMinor: bigint | null = null;
      if (mode === "single") {
        const a = parseAmount(cells[amountCol] ?? "", base);
        if (a) { direction = a.negative ? "out" : "in"; amountMinor = a.minor; }
      } else {
        const inA = parseAmount(cells[inCol] ?? "", base);
        const outA = parseAmount(cells[outCol] ?? "", base);
        if (outA) { direction = "out"; amountMinor = outA.minor; }
        else if (inA) { direction = "in"; amountMinor = inA.minor; }
      }
      const categoryId = direction === "out" ? expCatId : incCatId;
      const ok = !!date && !!direction && !!amountMinor && !!categoryId;
      return { date, description, direction, amountMinor, categoryId, ok };
    });
  }, [dataRows, dateCol, descCol, mode, amountCol, inCol, outCol, dateFmt, expCatId, incCatId, base]);

  const ready: ImportRow[] = parsed
    .filter((r) => r.ok)
    .map((r) => ({ date: r.date!, description: r.description, amountMinor: r.amountMinor!, direction: r.direction!, categoryId: r.categoryId }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setRaw(await file.text());
  }

  async function runImport() {
    if (!account || ready.length === 0) return;
    await doImport.mutateAsync({ accountId: account.id, currency: account.currency, base, rows: ready });
  }

  const colOptions = Array.from({ length: colCount }, (_, i) => (
    <option key={i} value={i}>{colLabel(i)}</option>
  ));

  return (
    <>
      <PageHeader title="Import transactions" subtitle="Bring in a bank or card statement as a CSV file." />

      {targets.length === 0 ? (
        <p className="text-ink/50">Add a {base} bank or cash account first, then come back to import into it.</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-ink/55">Import into</label>
                <Select className={field} value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)}>
                  {targets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink/55">CSV file</label>
                <input type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-forest file:px-3 file:py-2 file:text-sm file:font-medium file:text-paper" />
              </div>
            </div>
            <p className="mt-3 text-xs text-ink/45">…or paste the rows below.</p>
            <textarea
              className={`${field} mt-1 h-24 font-mono text-xs`}
              placeholder="2026-06-01,Salary,1200000&#10;2026-06-03,Groceries,-25000"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </section>

          {grid.length > 0 && (
            <section className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
              <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Match up the columns</p>
              <label className="mb-4 flex items-center gap-2 text-sm text-ink/70">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="h-4 w-4 accent-forest" />
                First row is a header
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Labelled label="Date column"><Select className={field} value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))}>{colOptions}</Select></Labelled>
                <Labelled label="Date format">
                  <Select className={field} value={dateFmt} onChange={(e) => setDateFmt(e.target.value as DateFormat)}>
                    <option value="ymd">Year-Month-Day</option>
                    <option value="dmy">Day-Month-Year</option>
                    <option value="mdy">Month-Day-Year</option>
                  </Select>
                </Labelled>
                <Labelled label="Description column"><Select className={field} value={descCol} onChange={(e) => setDescCol(Number(e.target.value))}>{colOptions}</Select></Labelled>
                <Labelled label="Amounts are in">
                  <Select className={field} value={mode} onChange={(e) => setMode(e.target.value as "single" | "split")}>
                    <option value="single">One column (minus = money out)</option>
                    <option value="split">Two columns (in / out)</option>
                  </Select>
                </Labelled>
                {mode === "single" ? (
                  <Labelled label="Amount column"><Select className={field} value={amountCol} onChange={(e) => setAmountCol(Number(e.target.value))}>{colOptions}</Select></Labelled>
                ) : (
                  <>
                    <Labelled label="Money in column"><Select className={field} value={inCol} onChange={(e) => setInCol(Number(e.target.value))}>{colOptions}</Select></Labelled>
                    <Labelled label="Money out column"><Select className={field} value={outCol} onChange={(e) => setOutCol(Number(e.target.value))}>{colOptions}</Select></Labelled>
                  </>
                )}
                <Labelled label="Category for money out">
                  <Select className={field} value={expCatId} onChange={(e) => setExpenseCat(e.target.value)}>
                    {expenseCats.length === 0 && <option value="">— none —</option>}
                    {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Labelled>
                <Labelled label="Category for money in">
                  <Select className={field} value={incCatId} onChange={(e) => setIncomeCat(e.target.value)}>
                    {incomeCats.length === 0 && <option value="">— none —</option>}
                    {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Labelled>
              </div>
            </section>
          )}

          {dataRows.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm uppercase tracking-wide text-ink/50">Preview</p>
                <p className="text-xs text-ink/50">{ready.length} of {dataRows.length} ready</p>
              </div>
              <div className="overflow-x-auto rounded-2xl bg-surface ring-1 ring-ink/5">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-ink/5">
                    {parsed.slice(0, 50).map((r, i) => (
                      <tr key={i} className={r.ok ? "" : "opacity-40"}>
                        <td className="px-4 py-2 text-ink/60">{r.date ?? "?"}</td>
                        <td className="px-4 py-2 text-ink/80">{r.description || "—"}</td>
                        <td className="px-4 py-2 text-ink/50">{r.direction === "out" ? "Out" : r.direction === "in" ? "In" : "?"}</td>
                        <td className="px-4 py-2 text-right">
                          {r.amountMinor != null
                            ? <Money value={money(r.direction === "out" ? -r.amountMinor : r.amountMinor, base)} tone="auto" className="text-sm" />
                            : <span className="text-ink/40">?</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dataRows.length > 50 && <p className="mt-2 text-xs text-ink/40">Showing the first 50 rows; all {dataRows.length} will be imported.</p>}

              <button
                type="button"
                onClick={runImport}
                disabled={ready.length === 0 || doImport.isPending}
                className="mt-4 w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50 sm:w-auto sm:px-8"
              >
                {doImport.isPending ? "Importing…" : `Import ${ready.length} transaction${ready.length === 1 ? "" : "s"}`}
              </button>
              <p className="mt-2 text-xs text-ink/45">Rows you've imported before are skipped automatically.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink/55">{label}</label>
      {children}
    </div>
  );
}
