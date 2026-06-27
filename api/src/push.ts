import { Router } from 'express';
import webpush from 'web-push';
import { prisma } from './db';
import { getUserId, requireAuth } from './auth';
import { HttpError, ok } from './http';
import { todayKeyMVD } from './time';

export const pushRouter = Router();

// DECISIÓN: las claves VAPID se leen de env y se configuran una sola vez al importar el módulo.
// Sin ellas el servidor arranca igual pero las notificaciones fallan en tiempo de ejecución.
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:sanfalcioni@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

const MESSAGES = [
  'Hoy no compites contra otros. Compites contra quien eras ayer. ¡Dale con todo!',
  'Cada rep cuenta. Cada kilo suma. Vos podés más de lo que creés.',
  'El gym no espera. Vos tampoco. ¡Es hoy!',
  'La constancia vence al talento cuando el talento no es constante.',
  'No te acordarás del cansancio. Sí te acordarás de haberlo hecho.',
  'Un día más. Una versión mejor. ¡A entrenar!',
  'Los que se rinden nunca saben lo cerca que estaban. Vos seguís.',
];

function todayMessage(): string {
  // Misma semilla por día: el mismo mensaje todo el día, distinto cada día.
  const [y, m, d] = todayKeyMVD().split('-').map(Number);
  return MESSAGES[(y * 31 + m * 12 + d) % MESSAGES.length];
}

// Notifica si el usuario tiene al menos un día de rutina definido (cualquier nombre).
// DECISIÓN: antes se exigía que el nombre del día empezara con la abreviatura del weekday
// (Lun, Mar…), lo que fallaba con días nombrados por contenido ('Pecho', 'Push', 'Día 1') y
// hacía que la notificación nunca llegara. Como los días se nombran libremente y la rutina es
// un split (no está mapeada al día de la semana), notificamos a la hora elegida a todo usuario
// que armó su rutina.
async function hasAnyRoutine(userId: string): Promise<boolean> {
  const count = await prisma.routineDay.count({ where: { routine: { userId } } });
  return count > 0;
}

// GET /push/subscription — estado actual de la suscripción del usuario.
pushRouter.get('/subscription', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const sub = await prisma.pushSubscription.findUnique({ where: { userId } });
  ok(res, sub ? { active: true, notifyTime: sub.notifyTime } : { active: false });
});

// POST /push/subscribe — guarda o actualiza la suscripción push del usuario.
pushRouter.post('/subscribe', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;

  if (typeof b.endpoint !== 'string' || !b.endpoint) throw new HttpError(400, 'endpoint requerido');
  const keys = b.keys as Record<string, string> | undefined;
  if (!keys?.p256dh || !keys?.auth) throw new HttpError(400, 'keys.p256dh y keys.auth requeridos');
  if (typeof b.notifyTime !== 'string' || !/^\d{2}:\d{2}$/.test(b.notifyTime)) {
    throw new HttpError(400, 'notifyTime debe ser "HH:MM"');
  }

  const sub = await prisma.pushSubscription.upsert({
    where: { userId },
    create: { userId, endpoint: b.endpoint, p256dh: keys.p256dh, auth: keys.auth, notifyTime: b.notifyTime },
    update: { endpoint: b.endpoint, p256dh: keys.p256dh, auth: keys.auth, notifyTime: b.notifyTime, lastSentDate: null },
  });
  ok(res, { active: true, notifyTime: sub.notifyTime });
});

// DELETE /push/subscribe — elimina la suscripción del usuario.
pushRouter.delete('/subscribe', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  await prisma.pushSubscription.deleteMany({ where: { userId } });
  ok(res, { active: false });
});

// POST /push/send-daily — llamado por el cron externo (cron-job.org) cada minuto.
// Verifica CRON_SECRET para que no lo llame cualquiera.
// Busca usuarios cuya notifyTime coincide con la hora Uruguay actual y que tengan rutina hoy.
pushRouter.post('/send-daily', async (req, res) => {
  // Sin CRON_SECRET el endpoint quedaría abierto a cualquiera: lo cerramos en vez de
  // ejecutar sin verificar. Para usarlo hay que configurar la env y mandar el header.
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, 'CRON_SECRET no configurado');
  if (req.headers['x-cron-secret'] !== secret) throw new HttpError(401, 'No autorizado');

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    ok(res, { sent: 0, reason: 'VAPID no configurado' });
    return;
  }

  const nowMVD = new Intl.DateTimeFormat('es-UY', {
    timeZone: 'America/Montevideo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  const today = todayKeyMVD();
  const subs = await prisma.pushSubscription.findMany({
    where: { 
      notifyTime: nowMVD,
      OR: [
        { lastSentDate: { not: today } },
        { lastSentDate: null }
      ]
    },
  });

  let sent = 0;
  for (const sub of subs) {
    const hasRoutine = await hasAnyRoutine(sub.userId);
    if (!hasRoutine) continue;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'gymlog 💪', body: todayMessage() }),
      );
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSentDate: today },
      });
      sent++;
    } catch (err: unknown) {
      // Solo borrar si el endpoint ya no existe (404) o expiró/fue revocado (410).
      // Un fallo transitorio (timeout, 500) NO debe desuscribir al usuario para siempre.
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }

  ok(res, { sent, time: nowMVD, date: today });
});

export { VAPID_PUBLIC_KEY };
