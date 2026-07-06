// A tiny toast event bus. `toast.*` can be called from anywhere — components,
// mutation hooks, even the query client's global error handler — without
// threading a hook through the tree. <Toaster/> subscribes and renders.
export type ToastKind = "success" | "error" | "info";
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (t: ToastItem) => void;
let listeners: Listener[] = [];
let seq = 0;

function emit(kind: ToastKind, message: string) {
  const t: ToastItem = { id: ++seq, kind, message };
  listeners.forEach((l) => l(t));
}

export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
  info: (message: string) => emit("info", message),
};

export function subscribeToasts(l: Listener): () => void {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}
