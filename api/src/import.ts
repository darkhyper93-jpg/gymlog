import { Router } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { prisma } from './db.js';
import { getUserId } from './auth.js';
import { HttpError, ok } from './http.js';
import { extractRoutine, CommitRoutineSchema } from './lib/llm.js';
import { fullInclude } from './routines.js';
import { getAllowedMuscleGroups, normalizeMg } from './muscle-groups.js';

export const importRouter = Router();

// ─── Multer ───────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['.txt', '.pdf', '.docx', '.xlsx', '.xls', '.csv']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Tipo de archivo no soportado. Usá txt, pdf, docx, xlsx, xls o csv.'));
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
    const corruptMsg = 'No se pudo leer el archivo (puede estar corrupto o no tener texto seleccionable); probá con otro archivo o pegá el texto.';
    if (ext === '.pdf') {
      try {
        // pdf-parse v2: clase PDFParse({ data: Buffer }), método getText() → { text }
        const parser = new PDFParse({ data: file.buffer });
        const result = await parser.getText();
        text = result.text;
      } catch {
        throw new HttpError(422, corruptMsg);
      }
    } else if (ext === '.docx') {
      try {
        const { value } = await mammoth.extractRawText({ buffer: file.buffer });
        text = value;
      } catch {
        throw new HttpError(422, corruptMsg);
      }
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
  const userId = getUserId(req);
  const pastedText = typeof req.body?.text === 'string' ? req.body.text : undefined;
  const text = await extractText(req.file, pastedText);
  const allowedGroups = [...(await getAllowedMuscleGroups(userId))];
  const preview = await extractRoutine(text, allowedGroups);
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

  // Re-validar muscleGroup server-side (defensa: el cliente pudo tocar el valor en el
  // preview); el conjunto permitido es built-in ∪ custom de ESTE usuario.
  const allowed = await getAllowedMuscleGroups(userId);
  function resolveMuscleGroup(raw: string | null): string | null {
    if (!raw) return null;
    const normalized = normalizeMg(raw);
    for (const candidate of allowed) {
      if (normalizeMg(candidate) === normalized) return candidate;
    }
    return null;
  }

  const created = await prisma.$transaction(async (tx) => {
    // 1) Resolver/crear ejercicios por nombre (case-insensitive, scopeado userId).
    //    La dedup en el mismo import evita duplicados entre días.
    // DECISIÓN: muscleGroup solo se setea al CREAR el ejercicio; si ya existía, no se
    // pisa su categorización previa.
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
          (
            await tx.exercise.create({
              data: { name: ex.name, userId, muscleGroup: resolveMuscleGroup(ex.muscleGroup) },
            })
          ).id;
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
