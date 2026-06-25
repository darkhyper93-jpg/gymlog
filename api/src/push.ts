import { Router } from 'express';
import webpush from 'web-push';
import { prisma } from './db';
import { getUserId, requireAuth } from './auth';
import { HttpError, ok } from './http';
import { todayKeyMVD, localDayKeyMVD } from './time';

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

// Detecta si hoy (hora Uruguay) hay algún día de rutina del usuario que coincida con el
// weekday actual. Los nombres de los días son libres (Lun, Lunes, Mon, Monday…); buscamos
// las abreviaciones comunes para ser tolerantes con distintos estilos.
async function hasTodayRoutine(userId: string): Promise<boolean> {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('es-UY', {
    timeZone: 'America/Montevideo',
    weekday: 'short',
  }).format(now); // "lun.", "mar.", …

  const abbr = weekday.replace('.', '').toLowerCase(); // "lun", "mar", …

  const days = await prisma.routineDay.findMany({
    where: { routine: { userId } },
    select: { name: true },
  });

  return days.some((d) => d.name.toLowerCase().startsWith(abbr));
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
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers['x-cron-secret'];
    if (provided !== secret) throw new HttpError(401, 'No autorizado');
  }

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
    where: { notifyTime: nowMVD, lastSentDate: { not: today } },
  });

// 👇 --- REEMPLAZA CON ESTE NUEVO BLOQUE DE DEPURACIÓN --- 👇
console.log("================ DEPURACIÓN AVANZADA ================");
console.log("Hora calculada en el servidor (nowMVD):", nowMVD);

// Busquemos TODAS las suscripciones en la base de datos para ver qué formatos tienen
const allSubs = await prisma.pushSubscription.findMany({});
console.log("Total de suscripciones en la BD:", allSubs.length);

allSubs.forEach((s, index) => {
  console.log(`[Sub ${index}] ID Usuario: ${s.userId} | Hora en BD: "${s.notifyTime}" | Último Envío (lastSentDate): "${s.lastSentDate}"`);
});
console.log("=====================================================");
// 👆 --------------------------------------------------------- 👆
  let sent = 0;
  for (const sub of subs) {
    const hasRoutine = await hasTodayRoutine(sub.userId);
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
    } catch {
      // Si el endpoint expiró, lo eliminamos para no acumular basura.
      await prisma.pushSubscription.delete({ where: { id: sub.id } });
    }
  }

  ok(res, { sent, time: nowMVD, date: today });
});

export { VAPID_PUBLIC_KEY };
