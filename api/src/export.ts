import { Router } from 'express';
import { prisma } from './db';
import { getUserId } from './auth';
import { localDayKeyMVD } from './time';

export const exportRouter = Router();

// GET /export — descarga todas las series del usuario en formato CSV.
// DECISIÓN: este endpoint no usa el envelope { success, data } porque devuelve texto plano,
// no JSON. Es la única excepción deliberada al envelope en toda la API.
exportRouter.get('/', async (req, res) => {
  const userId = getUserId(req);

  const sets = await prisma.workoutSet.findMany({
    where: { exercise: { userId } },
    include: { exercise: { select: { name: true, muscleGroup: true } } },
    orderBy: { date: 'desc' },
  });

  const rows: string[] = [
    'ejercicio,grupo_muscular,fecha,peso_kg,reps,rir,nota',
  ];

  for (const s of sets) {
    const cols = [
      csvCell(s.exercise.name),
      csvCell(s.exercise.muscleGroup ?? ''),
      localDayKeyMVD(s.date),
      String(s.weight),
      String(s.reps),
      s.rir != null ? String(s.rir) : '',
      csvCell(s.note ?? ''),
    ];
    rows.push(cols.join(','));
  }

  const csv = rows.join('\r\n');
  const filename = `gymlog-export-${localDayKeyMVD(new Date())}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

function csvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
