import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ToastItem } from '../lib/types';

export function Toasts({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast is-${toast.kind}`} role="status">
          {toast.kind === 'success' && <CheckCircle2 />}
          {toast.kind === 'error' && <AlertCircle />}
          {toast.kind === 'info' && <Info />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
