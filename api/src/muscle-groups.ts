import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { HttpError, ok } from './http';

export const muscleGroupsRouter = Router();

// Grupos musculares built-in (lista fija). Única fuente backend; antes vivía en exercises.ts.
export const BUILTIN_MUSCLE_GROUPS = [
  'espalda',
  'hombro',
  'pecho',
  'piernas',
  'triceps',
  'biceps',
  'antebrazo',
  'trapecio',
  'core',
  'abdominales',
] as const;

// Normaliza para comparar/deduplicar sin importar mayúsculas, acentos de capitalización o espacios.
export function normalizeMg(s: string): string {
  return s.trim().toLowerCase();
}

// Conjunto de grupos válidos para un usuario: built-in ∪ sus grupos custom.
export async function getAllowedMuscleGroups(userId: string): Promise<Set<string>> {
  const custom = await prisma.muscleGroup.findMany({ where: { userId } });
  return new Set<string>([...BUILTIN_MUSCLE_GROUPS, ...custom.map((g) => g.name)]);
}

function parseName(body: unknown): string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string') {
    throw new HttpError(400, 'name es requerido y debe ser texto');
  }
  const name = b.name.trim();
  if (name.length < 1 || name.length > 30) {
    throw new HttpError(400, 'name debe tener entre 1 y 30 caracteres');
  }
  return name;
}

// GET /muscle-groups — lista los grupos custom del usuario
muscleGroupsRouter.get('/', async (req, res) => {
  const userId = getUserId(req);
  const groups = await prisma.muscleGroup.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  ok(res, groups);
});

// POST /muscle-groups — crea un grupo custom { name }, dedup case-insensitive contra
// built-in y contra los propios.
muscleGroupsRouter.post('/', async (req, res) => {
  const userId = getUserId(req);
  const name = parseName(req.body);
  const normalized = normalizeMg(name);

  const isBuiltin = (BUILTIN_MUSCLE_GROUPS as readonly string[]).some(
    (g) => normalizeMg(g) === normalized,
  );
  if (isBuiltin) throw new HttpError(409, 'Ese grupo ya existe');

  const existing = await prisma.muscleGroup.findMany({ where: { userId } });
  if (existing.some((g) => normalizeMg(g.name) === normalized)) {
    throw new HttpError(409, 'Ese grupo ya existe');
  }

  const group = await prisma.muscleGroup.create({ data: { name, userId } });
  ok(res, group, 201);
});

// DELETE /muscle-groups/:id — borra un grupo custom TUYO; sus ejercicios quedan en
// muscleGroup: null ("Otros"), no se borran.
muscleGroupsRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const group = await prisma.muscleGroup.findFirst({ where: { id, userId } });
  if (!group) throw new HttpError(404, 'Grupo no encontrado');

  await prisma.$transaction([
    prisma.exercise.updateMany({
      where: { userId, muscleGroup: group.name },
      data: { muscleGroup: null },
    }),
    prisma.muscleGroup.delete({ where: { id } }),
  ]);
  ok(res, { id });
});
