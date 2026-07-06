import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

// A promise-based confirmation dialog, so every money-moving action can ask
// "are you sure?" before it's written. Postings are append-only (a mistake needs
// a reversal), so a quick check first is worth it.
interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => close(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-lg font-bold text-ink">{state.opts.title}</p>
            {state.opts.body && <p className="mt-2 text-sm text-ink/65">{state.opts.body}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => close(false)} className="rounded-lg px-4 py-2 text-sm text-ink/60 hover:bg-ink/5">
                Cancel
              </button>
              <button
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-paper ${state.opts.danger ? "bg-loss" : "bg-forest"}`}
              >
                {state.opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
