import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';
import { dayBoundsMVD, localDayKeyMVD } from './time';

export const bodyWeightRouter = Router();

type CreateBodyWeightBody = { weight: number; date?: Date };

function parseCreateBodyWeight(body: unknown): CreateBodyWeightBody {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.weight !== 'number' || !Number.isFinite(b.weight) || b.weight <= 0) {
    throw new HttpError(400, 'weight debe ser un número > 0');
  }
  const result: CreateBodyWeightBody = { weight: b.weight };
  if (b.date !== undefined) {
    if (typeof b.date !== 'string') throw new HttpError(400, 'date debe ser una fecha ISO');
    const d = new Date(b.date);
    if (isNaN(d.getTime())) throw new HttpError(400, 'date inválida');
    if (d > new Date()) throw new HttpError(400, 'No podés registrar un peso en el futuro');
    result.date = d;
  }
  return result;
}

// GET /body-weight — historial de pesadas del usuario, más reciente primero.
bodyWeightRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const entries = await prisma.bodyWeight.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  });
  ok(res, entries);
});

// POST /body-weight — registra una pesada nueva. Una por día Uruguay: si ya existe una
// para el mismo día, la actualiza en lugar de duplicar.
bodyWeightRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const data = parseCreateBodyWeight(req.body);
  const dateForKey = data.date ?? new Date();
  const dayKey = localDayKeyMVD(dateForKey);
  const { start, end } = dayBoundsMVD(dateForKey);

  // Si ya hay una pesada para este día (hora Uruguay), la actualiza.
  const existing = await prisma.bodyWeight.findFirst({
    where: { userId, date: { gte: start, lt: end } },
  });

  if (existing) {
    const updated = await prisma.bodyWeight.update({
      where: { id: existing.id },
      data: { weight: data.weight, date: data.date ?? existing.date },
    });
    ok(res, { entry: updated, dayKey, updated: true });
  } else {
    const entry = await prisma.bodyWeight.create({
      data: { userId, weight: data.weight, date: data.date ?? new Date() },
    });
    ok(res, { entry, dayKey, updated: false });
  }
});

// DELETE /body-weight/:id — borra una entrada de peso del usuario.
bodyWeightRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const existing = await prisma.bodyWeight.findFirst({ where: { id, userId } });
  if (!existing) throw new HttpError(404, 'Entrada de peso no encontrada');
  await prisma.bodyWeight.delete({ where: { id } });
  ok(res, { id });
});
