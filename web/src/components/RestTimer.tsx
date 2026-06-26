import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVerticalIcon, PauseIcon, PlayIcon, RotateCcwIcon, XIcon } from './icons';

const PRESETS = [60, 90, 120, 180] as const;

const STORAGE_KEY = 'rest-timer-pos';

// Posición por defecto: pegado al bottom de la pantalla, centrado.
const DEFAULT_POS = { x: 0, y: 0 };

function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POS;
    const p = JSON.parse(raw) as { x: number; y: number };
    if (typeof p.x === 'number' && typeof p.y === 'number') return p;
  } catch { /* noop */ }
  return DEFAULT_POS;
}

// Anillo de progreso SVG. viewBox 56×56, radio 24, grosor 4 → sin recorte en los bordes.
const RING_R = 24;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

function Ring({ progress, done }: { progress: number; done: boolean }) {
  return (
    <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="28" cy="28" r={RING_R} fill="none" strokeWidth="4" className="stroke-border" />
      <circle
        cx="28"
        cy="28"
        r={RING_R}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className={`transition-all duration-1000 ${done ? 'stroke-success' : 'stroke-brand'}`}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)))}
      />
    </svg>
  );
}

export function RestTimer({
  initialSeconds,
  onClose,
}: {
  initialSeconds: number;
  onClose: () => void;
}) {
  const [total, setTotal] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(true);
  const vibratedRef = useRef(false);

  // ─── Posición arrastrable ────────────────────────────────────────────────────
  const [pos, setPos] = useState<{ x: number; y: number }>(loadPos);
  const timerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function clampPos(x: number, y: number): { x: number; y: number } {
    const el = timerRef.current;
    if (!el) return { x, y };
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // El timer está posicionado desde bottom-center, así que x=0 = centrado.
    // translateX desplaza desde el centro; translateY desplaza hacia arriba (negativo = arriba).
    const minX = -(vw / 2 - w / 2);
    const maxX = vw / 2 - w / 2;
    const minY = -(vh - h - 80); // no sale por arriba de la pantalla
    const maxY = 0;              // no baja del punto base
    return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const next = clampPos(dragState.current.origX + dx, dragState.current.origY + dy);
    setPos(next);
  }

  function onPointerUp() {
    if (!dragState.current) return;
    dragState.current = null;
    setPos((p) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      return p;
    });
  }

  function resetPosition() {
    setPos(DEFAULT_POS);
    localStorage.removeItem(STORAGE_KEY);
  }

  // ─── Lógica del timer ────────────────────────────────────────────────────────

  // Tick
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [running, remaining]);

  // Vibrar + detener al llegar a 0
  useEffect(() => {
    if (remaining === 0 && !vibratedRef.current) {
      vibratedRef.current = true;
      setRunning(false);
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    }
  }, [remaining]);

  const preset = useCallback((secs: number) => {
    setTotal(secs);
    setRemaining(secs);
    setRunning(true);
    vibratedRef.current = false;
  }, []);

  const adjust = useCallback((delta: number) => {
    setRemaining((r) => {
      const next = Math.max(0, r + delta);
      if (next > 0) {
        setRunning(true);
        vibratedRef.current = false;
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setRemaining(total);
    setRunning(true);
    vibratedRef.current = false;
  }, [total]);

  const done = remaining === 0;
  const progress = total > 0 ? remaining / total : 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  const btnBase =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors ' +
    'hover:bg-surface-2 hover:text-fg active:scale-95 disabled:opacity-30 disabled:pointer-events-none';

  const presetBase =
    'flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold text-muted ' +
    'transition-colors hover:border-brand hover:text-brand active:scale-95';

  return (
    <div
      className="fixed inset-x-0 bottom-[68px] z-40 mx-auto max-w-md px-4 md:bottom-4"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      ref={timerRef}
    >
      <div
        className={`rounded-2xl border bg-surface shadow-xl transition-colors
          ${done ? 'border-success/50' : 'border-border'}`}
      >
        {/* Fila principal */}
        <div className="flex items-center gap-3 px-2 py-3">
          {/* Drag handle — para mover el timer sin interferir con scroll */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Mover timer"
            className="flex h-10 w-8 shrink-0 touch-none cursor-grab select-none items-center
              justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
          >
            <GripVerticalIcon className="h-4 w-4" />
          </div>

          {/* Anillo + countdown */}
          <div className="relative h-14 w-14 shrink-0">
            <Ring progress={progress} done={done} />
            <span className="tabular absolute inset-0 flex items-center justify-center text-xs font-bold text-fg">
              {mins}:{String(secs).padStart(2, '0')}
            </span>
          </div>

          {/* Estado */}
          <span className={`flex-1 text-sm font-medium ${done ? 'text-success' : 'text-muted'}`}>
            {done ? '¡Listo!' : 'Descansando…'}
          </span>

          {/* Controles principales */}
          <button
            onClick={() => setRunning((r) => !r)}
            aria-label={running ? 'Pausar' : 'Reanudar'}
            disabled={done}
            className={btnBase}
          >
            {running ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>
          <button onClick={reset} aria-label="Reiniciar cuenta" className={btnBase}>
            <RotateCcwIcon className="h-4 w-4" />
          </button>
          <button onClick={onClose} aria-label="Cerrar timer" className={btnBase}>
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Fila de presets, ajustes y reset de posición */}
        <div className="flex gap-1.5 border-t border-border px-3 pb-3 pt-2">
          <button onClick={() => adjust(-15)} disabled={remaining <= 0} className={presetBase}>
            −15s
          </button>
          {PRESETS.map((s) => (
            <button key={s} onClick={() => preset(s)} className={presetBase}>
              {s < 60 ? `${s}s` : `${s / 60}m`}
            </button>
          ))}
          <button onClick={() => adjust(15)} className={presetBase}>
            +15s
          </button>
          {/* Volver al centro — solo visible si el timer fue movido */}
          {(pos.x !== 0 || pos.y !== 0) && (
            <button
              onClick={resetPosition}
              aria-label="Volver a posición por defecto"
              title="Volver al centro"
              className={presetBase}
            >
              ⌂
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
