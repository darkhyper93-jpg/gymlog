import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { HttpError, ok } from './http';

// requireAuth deja el id del usuario logueado en req.userId; lo tipamos así (sin any) y los
// handlers lo leen con getUserId() para filtrar los datos por dueño.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const authRouter = Router();

// DECISIÓN: secreto del JWT desde env (JWT_SECRET). En dev hay un fallback para no frenar el
// desarrollo; en producción es obligatorio (ver README §11). Sin refresh tokens: el token dura
// 30 días, suficiente para una app personal.
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-gymlog-secret-cambialo-en-produccion';
const TOKEN_TTL = '30d';

type Credentials = { username: string; password: string };

// Valida { username, password } del body. Mínimos explícitos para no ensuciar la base.
function parseCredentials(body: unknown): Credentials {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.username !== 'string' || b.username.trim().length < 3) {
    throw new HttpError(400, 'username es requerido (mínimo 3 caracteres)');
  }
  if (typeof b.password !== 'string' || b.password.length < 6) {
    throw new HttpError(400, 'password es requerido (mínimo 6 caracteres)');
  }
  return { username: b.username.trim(), password: b.password };
}

function signToken(payload: { userId: string; username: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// POST /auth/register — crea el usuario (password hasheada) y devuelve un token ya logueado.
authRouter.post('/register', async (req, res) => {
  const { username, password } = parseCredentials(req.body);
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new HttpError(409, 'Ese usuario ya existe');
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { username, passwordHash } });
  ok(res, { token: signToken({ userId: user.id, username: user.username }) }, 201);
});

// POST /auth/login — valida credenciales y devuelve un token.
authRouter.post('/login', async (req, res) => {
  const { username, password } = parseCredentials(req.body);
  const user = await prisma.user.findUnique({ where: { username } });
  // Mismo mensaje para usuario inexistente o password mala: no filtrar qué falló.
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) throw new HttpError(401, 'Usuario o contraseña incorrectos');
  ok(res, { token: signToken({ userId: user.id, username: user.username }) });
});

// Middleware portero: exige Authorization: Bearer <token>, valida el JWT y deja el userId
// en req.userId para que los handlers filtren los datos por dueño.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Falta el token de autenticación');
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Token inválido o expirado');
  }
  if (typeof decoded === 'string' || typeof decoded.userId !== 'string') {
    throw new HttpError(401, 'Token inválido o expirado');
  }
  req.userId = decoded.userId;
  next();
}

// Lee el usuario logueado de la request (lo dejó requireAuth). Tira 401 si falta, para no
// ejecutar nunca una query de datos sin dueño.
export function getUserId(req: Request): string {
  if (!req.userId) throw new HttpError(401, 'No autenticado');
  return req.userId;
}
