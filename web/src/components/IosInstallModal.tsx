import { useEffect } from 'react';
import { XIcon, ShareIosIcon, PlusSquareIcon } from './icons';

export function IosInstallModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border
        bg-bg p-6 shadow-xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">Instalar en tu iPhone</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted
              hover:bg-surface-2 hover:text-fg"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Steps */}
        <ol className="flex flex-col gap-4">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
              bg-brand text-xs font-bold text-white">1</span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-fg">Tocá Compartir</span>
              <ShareIosIcon className="h-6 w-6 text-brand" />
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
              bg-brand text-xs font-bold text-white">2</span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-fg">Tocá "Agregar a inicio"</span>
              <PlusSquareIcon className="h-6 w-6 text-brand" />
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
              bg-brand text-xs font-bold text-white">3</span>
            <span className="text-sm font-semibold text-fg">Tocá "Agregar"</span>
          </li>
        </ol>

        <p className="text-xs text-muted">
          ¿No ves Compartir? Tocá <span className="font-semibold">•••</span> o "Ver más".
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white
            transition-opacity hover:opacity-90"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
