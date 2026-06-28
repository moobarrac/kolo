import { money } from "@kolo/shared";
import { Money } from "@/components/Money";

// Placeholder shell. Phase 1 builds the real Overview (net-worth hero + bridge).
// This screen exists to prove the toolchain + shared package wire up correctly.
export default function App() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-bold text-forest">Kólò</h1>
        <p className="mt-1 text-ink/60">Your personal financial operating system.</p>
      </header>

      <section className="rounded-2xl bg-surface p-8 shadow-sm ring-1 ring-ink/5">
        <p className="text-sm uppercase tracking-wide text-ink/50">Net worth</p>
        <div className="mt-2 text-5xl">
          <Money value={money(960000000n, "NGN")} tone="balance" />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-ink/50">Inflow</p>
            <Money value={money(120000000n, "NGN")} tone="gain" />
          </div>
          <div>
            <p className="text-ink/50">Outflow</p>
            <Money value={money(-80000000n, "NGN")} tone="loss" />
          </div>
          <div>
            <p className="text-ink/50">USD held</p>
            <Money value={money(500000n, "USD")} tone="balance" />
          </div>
        </div>
        <p className="mt-8 text-xs text-ink/40">
          Scaffold only — see <code>docs/tech-doc.md</code> §15 for the build phases.
        </p>
      </section>
    </main>
  );
}
