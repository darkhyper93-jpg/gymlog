import { useState } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Button } from './ui';
import { BellIcon, BellOffIcon, XIcon } from './icons';

export function NotificationButton({ onClick }: { onClick: () => void }) {
  const { sub, supported } = usePushNotifications();
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Configurar notificaciones"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors
        hover:bg-surface-2 hover:text-fg"
    >
      {sub.active
        ? <BellIcon className="h-5 w-5 text-brand" />
        : <BellOffIcon className="h-5 w-5" />
      }
    </button>
  );
}

export function NotificationModal({ onClose }: { onClose: () => void }) {
  const { status, sub, permission, supported, subscribe, unsubscribe } = usePushNotifications();
  const [time, setTime] = useState(sub.active ? sub.notifyTime : '08:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnable() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await subscribe(time);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    if (saving) return;
    setSaving(true);
    try {
      await unsubscribe();
    } catch {
      // estado ya actualizado localmente
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border
        bg-bg p-6 shadow-xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-fg">Recordatorios</h2>
            <p className="text-sm text-muted">Solo los días que tenés rutina</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted
              hover:bg-surface-2 hover:text-fg"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {!supported && (
          <p className="text-sm text-muted">
            Tu navegador no soporta notificaciones push. Probá con Chrome en Android.
          </p>
        )}

        {supported && status === 'loading' && (
          <p className="text-sm text-muted">Cargando…</p>
        )}

        {supported && status === 'ready' && (
          <>
            {permission === 'denied' && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                Bloqueaste los permisos de notificación. Para activarlas, entrá a la configuración
                del navegador y permití las notificaciones para este sitio.
              </p>
            )}

            {sub.active ? (
              // Estado: ACTIVO
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand-soft/10 px-4 py-3">
                  <p className="text-sm font-medium text-brand">Notificaciones activas</p>
                  <p className="text-sm text-muted">
                    Te aviso a las <strong className="text-fg">{sub.notifyTime}</strong> los días que
                    tenés rutina con un mensaje motivador.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-muted">Cambiar hora</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm
                      text-fg focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => void handleEnable()}
                    disabled={saving || time === sub.notifyTime}
                    className="flex-1"
                  >
                    {saving ? 'Guardando…' : 'Guardar hora'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void handleDisable()}
                    disabled={saving}
                    className="flex-1 text-danger hover:text-danger"
                  >
                    Desactivar
                  </Button>
                </div>
              </div>
            ) : (
              // Estado: INACTIVO
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted leading-relaxed">
                  Activá los recordatorios y elegí la hora. Solo te notifico los días que
                  tenés rutina programada — nunca de más.
                </p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-muted">¿A qué hora querés que te avise?</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm
                      text-fg focus:border-brand focus:outline-none"
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button
                  onClick={() => void handleEnable()}
                  disabled={saving || permission === 'denied'}
                >
                  {saving ? 'Activando…' : 'Activar recordatorios'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
