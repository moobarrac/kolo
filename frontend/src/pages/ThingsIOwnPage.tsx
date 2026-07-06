import { Select } from "@/components/Select";
import { useMemo, useState } from "react";
import { parseToMinor, formatMoney, money, type AssetClass } from "@kolo/shared";
import { PageHeader } from "@/components/PageHeader";
import { Money } from "@/components/Money";
import { useConfirm } from "@/components/Confirm";
import { DateField } from "@/components/DateField";
import { useAssets, useCreateAsset, useRevalueAsset, useUserAccounts, useProfile, type AssetRow } from "@/lib/data";
import { todayIso } from "@/lib/dates";

const field = "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-forest";
const MONEY = new Set(["cash", "bank", "mobile_money"]);

const CLASSES: { value: AssetClass; label: string }[] = [
  { value: "real_estate", label: "Property" },
  { value: "land", label: "Land" },
  { value: "gold", label: "Gold" },
  { value: "equities", label: "Stocks" },
  { value: "vehicle", label: "Vehicle" },
  { value: "business", label: "Business" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other" },
];
const classLabel = (c: string) => CLASSES.find((x) => x.value === c)?.label ?? c;

export function ThingsIOwnPage() {
  const { data: profile } = useProfile();
  const { data: accounts } = useUserAccounts();
  const assets = useAssets();
  const create = useCreateAsset();
  const base = profile?.base_currency ?? "NGN";

  const moneyAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "asset" && a.subtype && MONEY.has(a.subtype)),
    [accounts],
  );

  const [name, setName] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("real_estate");
  const [cost, setCost] = useState("");
  const [fundingId, setFundingId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!name.trim()) throw new Error("Give it a name.");
      if (!fundingId) throw new Error("Choose where the money came from.");
      const costMinor = parseToMinor(cost, base);
      if (costMinor <= 0n) throw new Error("Enter what you paid.");
      await create.mutateAsync({
        name: name.trim(), assetClass, currency: base, costMinor, fundingAccountId: fundingId,
        purchaseDate: date, fxRate: 1,
      });
      setName(""); setCost("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <PageHeader title="Things I own" subtitle="Property, savings, gold, and more." />
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
        <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-ink/5">
          <p className="mb-4 text-sm uppercase tracking-wide text-ink/50">Add something you own</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink/55">What is it?</label>
              <Select className={field} value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
                {CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Name</label>
              <input className={field} placeholder="e.g. Lekki land" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">What you paid ({base})</label>
              <input className={field} inputMode="decimal" placeholder="0.00" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Paid from</label>
              <Select className={field} value={fundingId} onChange={(e) => setFundingId(e.target.value)}>
                <option value="">Choose an account</option>
                {moneyAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              {moneyAccounts.length === 0 && <p className="mt-1 text-xs text-ink/45">Add a bank or cash account in Settings first.</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink/55">Date</label>
              <DateField value={date} onChange={setDate} />
            </div>
            {error && <p className="text-sm text-loss">{error}</p>}
            <button type="submit" disabled={create.isPending} className="w-full rounded-lg bg-forest px-4 py-3 text-sm font-medium text-paper disabled:opacity-50">
              {create.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </form>

        <section>
          <p className="mb-3 text-sm uppercase tracking-wide text-ink/50">What you own</p>
          {(assets.data?.assets.length ?? 0) === 0 && <p className="text-ink/50">Nothing added yet.</p>}
          <ul className="space-y-2">
            {assets.data?.assets.map((a) => <AssetItem key={a.id} asset={a} base={assets.data!.base} />)}
          </ul>
        </section>
      </div>
    </>
  );
}

function AssetItem({ asset, base }: { asset: AssetRow; base: string }) {
  const revalue = useRevalueAsset();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const cur = asset.currency ?? base;
  const gain = asset.current_value_minor - (asset.purchase_price_minor ?? 0);

  async function save() {
    const newValueMinor = parseToMinor(value, cur);
    if (newValueMinor < 0n) return;
    const ok = await confirm({
      title: "Update its value?",
      body: `Set ${asset.name} to ${formatMoney(money(newValueMinor, cur))}.`,
      confirmLabel: "Update",
    });
    if (!ok) return;
    await revalue.mutateAsync({ assetId: asset.id, accountId: asset.account_id, currency: cur, newValueMinor, asOfDate: todayIso() });
    setEditing(false); setValue("");
  }

  return (
    <li className="rounded-xl bg-surface px-4 py-3 ring-1 ring-ink/5">
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="font-medium">{asset.name}</p>
          <p className="text-xs text-ink/50">{classLabel(asset.asset_class)}</p>
        </div>
        <div className="text-right">
          <Money value={money(BigInt(asset.current_value_minor), cur)} tone="balance" />
          {gain !== 0 && (
            <p className="text-xs">
              <Money value={money(BigInt(gain), cur)} tone="auto" /> <span className="text-ink/40">since you got it</span>
            </p>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-3 flex gap-2">
          <input className={field} inputMode="decimal" placeholder={`What's it worth now? (${cur})`} value={value} onChange={(e) => setValue(e.target.value)} />
          <button onClick={save} disabled={revalue.isPending} className="rounded-lg bg-forest px-3 py-2 text-sm font-medium text-paper disabled:opacity-50">Save</button>
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-sm text-ink/55">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-2 text-xs text-brass hover:underline">Update its value</button>
      )}
    </li>
  );
}
