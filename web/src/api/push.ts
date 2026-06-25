import { apiRequest } from './client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushStatus =
  | { active: false }
  | { active: true; notifyTime: string };

export function getPushSubscription(): Promise<PushStatus> {
  return apiRequest<PushStatus>('/push/subscription');
}

export function deletePushSubscription(): Promise<PushStatus> {
  return apiRequest<PushStatus>('/push/subscribe', { method: 'DELETE' });
}

export async function subscribePush(notifyTime: string): Promise<PushStatus> {
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY no configurada');

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = sub.toJSON();
  return apiRequest<PushStatus>('/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: sub.endpoint,
      keys: json.keys,
      notifyTime,
    },
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
