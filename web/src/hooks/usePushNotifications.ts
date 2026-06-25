import { useCallback, useEffect, useState } from 'react';
import { getPushSubscription, subscribePush, deletePushSubscription } from '../api/push';
import type { PushStatus } from '../api/push';

type Status = 'loading' | 'ready' | 'error';
export type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const [status, setStatus] = useState<Status>('loading');
  const [sub, setSub] = useState<PushStatus>({ active: false });
  const [permission, setPermission] = useState<Permission>('default');

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  useEffect(() => {
    if (!supported) { setPermission('unsupported'); setStatus('ready'); return; }
    setPermission(Notification.permission as Permission);
    getPushSubscription()
      .then((s) => { setSub(s); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, [supported]);

  const subscribe = useCallback(async (notifyTime: string): Promise<void> => {
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
      setPermission(perm as Permission);
    }
    if (perm !== 'granted') return;
    const result = await subscribePush(notifyTime);
    setSub(result);
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    const result = await deletePushSubscription();
    setSub(result);
  }, []);

  return { status, sub, permission, supported, subscribe, unsubscribe };
}
