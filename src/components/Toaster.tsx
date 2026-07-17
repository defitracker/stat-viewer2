import { X } from "lucide-react";
import { useToast, ToastKind } from "@/util/toast";

const KIND_CLS: Record<ToastKind, string> = {
  warn: "border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  error: "border-red-500/50 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  info: "border-blue-500/50 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
};

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          data-kind={t.kind}
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg ${KIND_CLS[t.kind]}`}
        >
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="mt-0.5 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
