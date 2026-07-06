import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

// A styled dropdown that replaces the native <select> so the option list looks
// consistent and positions predictably on mobile (the app avoids native pickers
// for the same reason DateField does). Drop-in: keep the same `<option>` children,
// `value`, and `onChange` — onChange receives a `{ target: { value } }`-shaped arg
// so existing `(e) => setX(e.target.value)` handlers work unchanged.
interface OptionProps {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
}
type SelectEvent = { target: { value: string } };

export function Select({
  value,
  onChange,
  children,
  className = "",
  placeholder = "Select…",
  disabled = false,
}: {
  value: string | number;
  onChange: (e: SelectEvent) => void;
  children: ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const options = Children.toArray(children)
    .filter((c): c is ReactElement<OptionProps> => isValidElement(c) && c.type === "option")
    .map((c) => ({ value: String(c.props.value ?? ""), label: c.props.children, disabled: !!c.props.disabled }));

  const current = String(value);
  const selected = options.find((o) => o.value === current);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      setDropUp(below < 280 && r.top > below); // open upward when there's more room above
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:opacity-50`}
      >
        <span className={`truncate ${selected ? "" : "text-ink/40"}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-ink/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className={`absolute left-0 z-50 max-h-64 w-full overflow-auto rounded-lg bg-surface p-1 shadow-xl ring-1 ring-ink/10 ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {options.map((o) => {
            const isSel = o.value === current;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  disabled={o.disabled}
                  role="option"
                  aria-selected={isSel}
                  onClick={() => { onChange({ target: { value: o.value } }); setOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm disabled:opacity-40 ${
                    isSel ? "bg-forest/10 text-forest" : "text-ink/80 hover:bg-ink/5"
                  }`}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSel && <Check size={15} className="shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
