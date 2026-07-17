import { create } from "zustand";

export type ToastKind = "warn" | "error" | "info";
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = "warn") => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from non-React code (event handlers, effects). */
export const toast = (message: string, kind: ToastKind = "warn") =>
  useToast.getState().push(message, kind);
