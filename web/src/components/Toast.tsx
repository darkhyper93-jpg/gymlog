import { useEffect } from 'react';
import { TrophyIcon, XIcon } from './icons';

const AUTODISMISS_MS = 4000;

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, AUTODISMISS_MS);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="fixed inset-x-0 top-4 z-50 mx-auto max-w-md px-4">
      <div
        className="flex items-center gap-3 rounded-2xl border border-brand/40
          bg-surface px-4 py-3 shadow-xl"
        role="status"
        aria-live="polite"
      >
        <TrophyIcon className="h-5 w-5 shrink-0 text-brand" />
        <span className="flex-1 text-sm font-semibold text-fg">{message}</span>
        <button
          onClick={onDismiss}
          aria-label="Cerrar"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted
            transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
