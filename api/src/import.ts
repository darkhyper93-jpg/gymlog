import { Router } from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import * as XLSX from 'xlsx';
import { prisma } from './db.js';
import { getUserId } from './auth.js';
import { HttpError, ok } from './http.js';
import { extractRoutine, CommitRoutineSchema } from './lib/llm.js';
import { fullInclude } from './routines.js';

export const importRouter = Router();

// ─── pdf-parse: ES module interop ────────────────────────────────────────────
// pdf-parse es CommonJS y corre código de debug al importar desde su index.js.
// Importamos el subpath interno para evitar ese efecto lateral.
// Si el interop ESM falla, createRequire es el fallback seguro.
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = _require('pdf-parse/lib/pdf-parse.js');

// ─── Multer ───────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['.txt', '.pdf', '.xlsx', '.xls', '.csv']);
const ALLOWED_MIMES = new Set([
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/octet-stream', // algunos browsers usan esto para xlsx
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (ALLOWED_EXTS.has(ext) || ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Tipo de archivo no soportado. Usá txt, pdf, xlsx, xls o csv.'));
    }
  },
});

// ─── Extracción de texto ──────────────────────────────────────────────────────

async function extractText(file: Express.Multer.File | undefined, pastedText: string | undefined): Promise<string> {
  let text: string;

  if (pastedText && pastedText.trim().length > 0) {
    text = pastedText;
  } else if (file) {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (ext === '.pdf') {
      const result = await pdfParse(file.buffer);
      text = result.text;
    } else if (ext === '.xlsx' || ext === '.xls') {
      const wb = XLSX.read(file.buffer, { type: 'buffer' });
      text = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        return sheet ? XLSX.utils.sheet_to_csv(sheet) : '';
      }).join('\n');
    } else {
      // .txt y .csv: texto plano
      text = file.buffer.toString('utf-8');
    }
  } else {
    throw new HttpError(400, 'Enviá texto o un archivo para importar');
  }

  if (text.trim().length === 0) {
    throw new HttpError(400, 'No se pudo extraer texto del archivo');
  }
  if (text.length > 50_000) {
    throw new HttpError(413, 'El documento es demasiado largo (máx 50 000 caracteres)');
  }
  return text;
}

// ─── POST /import/parse ───────────────────────────────────────────────────────
// Extrae texto, llama al LLM y devuelve el preview SIN guardar nada.

importRouter.post('/parse', upload.single('file'), async (req, res) => {
  getUserId(req); // exige auth
  const pastedText = typeof req.body?.text === 'string' ? req.body.text : undefined;
  const text = await extractText(req.file, pastedText);
  const preview = await extractRoutine(text);
  ok(res, preview);
});

// ─── POST /import/commit ──────────────────────────────────────────────────────
// Recibe la rutina confirmada (JSON), la valida con Zod y la persiste en transacción.

importRouter.post('/commit', async (req, res) => {
  const userId = getUserId(req);
  const parsed = CommitRoutineSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, 'Rutina inválida: ' + (first?.message ?? 'datos incorrectos'));
  }
  const routine = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    // 1) Resolver/crear ejercicios por nombre (case-insensitive, scopeado userId).
    //    La dedup en el mismo import evita duplicados entre días.
    const nameToId = new Map<string, string>();
    for (const day of routine.days) {
      for (const ex of day.exercises) {
        const key = ex.name.toLowerCase();
        if (nameToId.has(key)) continue;
        const existing = await tx.exercise.findFirst({
          where: { userId, name: { equals: ex.name, mode: 'insensitive' } },
        });
        const id =
          existing?.id ??
          (await tx.exercise.create({ data: { name: ex.name, userId } })).id;
        nameToId.set(key, id);
      }
    }

    // 2) Crear la rutina al final del orden.
    const last = await tx.routine.findFirst({ where: { userId }, orderBy: { order: 'desc' } });
    const routineRow = await tx.routine.create({
      data: { name: routine.name, userId, order: (last?.order ?? -1) + 1 },
    });

    // 3) Crear días + ítems con campos planeados.
    for (const [di, day] of routine.days.entries()) {
      const dayRow = await tx.routineDay.create({
        data: {
          name: day.name ?? `Día ${di + 1}`,
          routineId: routineRow.id,
          order: di,
        },
      });
      for (const [ei, ex] of day.exercises.entries()) {
        await tx.routineDayExercise.create({
          data: {
            routineDayId: dayRow.id,
            exerciseId: nameToId.get(ex.name.toLowerCase())!,
            order: ei,
            plannedSets: ex.plannedSets,
            plannedReps: ex.plannedReps,
            plannedRir: ex.plannedRir,
            restSeconds: ex.restSeconds,
            note: ex.note,
          },
        });
      }
    }

    // 4) Devolver rutina completa (mismo shape que GET /routines).
    return tx.routine.findUniqueOrThrow({
      where: { id: routineRow.id },
      include: fullInclude,
    });
  });

  ok(res, created, 201);
});
