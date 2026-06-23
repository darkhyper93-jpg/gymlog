# Plan de desarrollo — gymlog (V1 completo por etapas)

## Contexto

`README.md` es el documento maestro (la "fuente de verdad" que `CLAUDE.md` llama
`gymlog-proyecto.md`). El backend tiene el núcleo arrancado: Express 5 + TS (ESM),
Prisma 6.x + SQLite, modelo de datos con `Exercise` y `WorkoutSet`, y endpoints
`GET /health`, `GET /exercises`, `POST /exercises`.

Al revisar el código contra el doc aparecieron **gaps reales**:

1. **El doc miente sobre el estado.** §7 y §10 marcan `PATCH /exercises/:id` y
   `DELETE /exercises/:id` como hechos y "probados de punta a punta", pero
   `api/src/exercises.ts` **solo tiene GET y POST**. PATCH y DELETE no existen.
2. **Los handlers existentes violan reglas de `CLAUDE.md`:** `req.body` se desestructura
   sin tipar (`name`/`target` son `any` implícito), no hay validación del input externo,
   y no hay envelope de error al fallar.
3. Faltan los endpoints de series y "última vez" (corazón del V1).
4. No existe `web/` (frontend) ni login.

**Objetivo:** terminar el V1 entero —backend → frontend ejercicios → frontend registrar
hoy → login → deploy— en etapas, con un **checkpoint de pausa y verificación real** entre
cada una, sin que las etapas se pisen.

**Decisiones tomadas con el usuario:**
- Alcance: todo el roadmap, por etapas con checkpoints.
- Login: **tabla `User` + password hasheada (bcrypt) + JWT** (sin refresh tokens).
  Esto agrega una tabla nueva → se documenta en el doc maestro antes de codear (Etapa 4).

**Principios que mandan (de CLAUDE.md):** mobile-first, envelope `{ success, data }`,
TS sin `any` injustificado, validar input externo, estructura liviana (una conexión Prisma
+ un router por entidad, sin capas), 4 estados en cada pantalla (cargando/vacío/error/datos),
Prisma fijado en 6.x, sin `console.log` en código terminado.

---

## ETAPA 1 — Backend: completar ejercicios + series + "última vez"

### 1.1 Alinear el doc maestro con la realidad
- En `README.md` §7 y §10: bajar PATCH/DELETE de "hecho" a "en progreso" (todavía no
  existían). Dejar el estado honesto antes de empezar a codear.

### 1.2 Endurecer y completar `api/src/exercises.ts`
- Definir tipos explícitos para los bodies (ej. `type CreateExerciseBody = { name: string; target?: string }`).
- Validación mínima explícita: `name` requerido y string no vacío; `target` opcional string.
  Si falla → responder `400` con error claro (no envelope de éxito).
- Agregar los endpoints faltantes:
  - `PATCH /exercises/:id` — edita `name` y/o `target`. 404 si no existe.
  - `DELETE /exercises/:id` — borra el ejercicio (sus series caen por `onDelete: Cascade`).
    Responder `{ success: true, data: { id } }`. 404 si no existe.
- Manejo de errores: Express 5 propaga el rechazo de promesa; agregar un **handler de error
  central** en `server.ts` que devuelva `{ success: false, error }` con el status correcto.

### 1.3 Nuevo router de series — `api/src/sets.ts`
- `type CreateSetBody = { exerciseId: string; weight: number; reps: number; rir?: number }`.
- `POST /sets` — valida tipos/rangos (weight ≥ 0, reps entero > 0, rir opcional entero ≥ 0),
  verifica que el `exerciseId` exista (404 si no), crea la serie. `201` + envelope.
- `GET /exercises/:id/last` — devuelve las series de la **última fecha registrada** de ese
  ejercicio (para saber qué superar). Si no hay historial → `data: null` (no es error).
- `GET /exercises/:id/sets` — historial completo de series del ejercicio (más nuevo primero).
- Montar en `server.ts`: `app.use('/sets', setsRouter)` y las rutas `/exercises/:id/...`
  (decidir si van en `exercises.ts` o en un router propio; preferir mantenerlas junto a
  ejercicios para que la URL sea coherente).

### 1.4 Pequeño helper de respuesta (opcional, si reduce repetición)
- Si el envelope se repite mucho, un mini-helper `ok(res, data, status?)` / `fail(...)`.
  Sólo si aporta; no inventar capas.

### Archivos tocados en Etapa 1
- `README.md` (§7, §10)
- `api/src/exercises.ts` (tipos, validación, PATCH, DELETE)
- `api/src/sets.ts` (nuevo)
- `api/src/server.ts` (montar rutas + error handler central)

### ✅ CHECKPOINT 1 — verificación real (no asumida)
Con el server corriendo (`npm run dev`), probar **de verdad** con `Invoke-RestMethod`:
- Crear ejercicio → listar → PATCH (editar target) → crear 2-3 series → `GET .../last`
  devuelve la última fecha → `GET .../sets` historial → DELETE ejercicio borra sus series.
- Probar inputs inválidos (sin `name`, `reps` negativo, `exerciseId` inexistente) → 400/404
  con `{ success: false, error }`.
- Confirmar: todos los endpoints con envelope, sin `console.log` nuevos, sin `any` sin justificar.
**PAUSA** para que el usuario verifique antes de tocar el frontend.

---

## ETAPA 2 — Frontend: scaffold + pantalla de ejercicios

### 2.1 Crear `web/` (mobile-first)
- Vite + React + TypeScript en `web/`. Tailwind CSS (plugin oficial de Vite).
- Centralizar tokens de diseño (colores, spacing) en la config de Tailwind / un archivo de
  tema — nada hardcodeado desprolijo (regla CLAUDE.md). Botones grandes, pocos toques.
- Configurar la URL base de la API por env (`VITE_API_URL`, default `http://localhost:4000`).

### 2.2 Capa de API tipada — `web/src/api/`
- Funciones tipadas que consumen los endpoints y **desempaquetan el envelope** `{ success, data }`,
  tirando error claro si `success === false`. Tipos compartidos `Exercise`, `WorkoutSet`.

### 2.3 Pantalla de ejercicios
- Hook de datos para listar ejercicios. Componente con los **4 estados**: cargando, vacío
  (empty state con CTA "agregar"), error (con reintento), con datos.
- Acciones: agregar, editar (nombre + objetivo), borrar. Todo mobile-first.

### Archivos (nuevos) en Etapa 2
- `web/` completo (config Vite/Tailwind/TS)
- `web/src/api/client.ts`, `web/src/api/exercises.ts`, `web/src/types.ts`
- `web/src/components/` + pantalla de ejercicios

### ✅ CHECKPOINT 2
Correr backend + `web` en dev. Crear/editar/borrar un ejercicio desde el celu/responsive y
ver reflejado en la base. Verificar los 4 estados (incl. apagar el backend para ver "error").
**PAUSA.**

---

## ETAPA 3 — Frontend: pantalla "registrar hoy" (el corazón)

### 3.1 Flujo de registro rápido
- Elegir un ejercicio → mostrar **objetivo** (target) + **última vez** (`GET .../last`) al lado.
- Cargar series (peso, reps, RIR) en 2-3 toques: inputs grandes, defaults inteligentes
  (prefill con la última serie para "superar"), botón grande de "agregar serie".
- Estados: cargando última vez, vacío (sin historial → "primera vez con este ejercicio"),
  error, con datos. Optimista al agregar serie, con rollback si falla.

### Archivos en Etapa 3
- `web/src/api/sets.ts`, hook de "última vez", pantalla/componentes de registro.

### ✅ CHECKPOINT 3
Registrar una sesión real de punta a punta desde el celu; reabrir y ver que la "última vez"
ahora refleja lo cargado. **PAUSA.**

---

## ETAPA 4 — Login (tabla User + bcrypt + JWT)

### 4.1 Doc maestro primero
- Agregar el modelo `User` y la decisión de auth (bcrypt + JWT, sin refresh) a `README.md`
  §6 (modelo de datos) y §11 (decisiones). **Antes** de tocar el schema (regla CLAUDE.md).

### 4.2 Backend
- `schema.prisma`: modelo `User { id, username @unique, passwordHash, createdAt }`.
  `npx prisma db push` (sigue 6.x). (Decidir si las series/ejercicios se atan a `userId`;
  para V1 personal probablemente **no** hace falta multiusuario real → dejar tablas como están
  y sólo proteger con login. Confirmar en el checkpoint.)
- `api/src/auth.ts`: `POST /auth/register`, `POST /auth/login` (bcrypt compare → firma JWT),
  middleware `requireAuth` que valida el `Authorization: Bearer`. `JWT_SECRET` en `.env`.
- Proteger las rutas de datos con `requireAuth` en `server.ts`.
- Deps nuevas en `api`: `bcryptjs` + `jsonwebtoken` (+ `@types/...`).

### 4.3 Frontend
- Pantalla de login (mobile-first, 4 estados). Guardar token, adjuntarlo en cada request
  (en `web/src/api/client.ts`). Redirigir a login si 401.

### ✅ CHECKPOINT 4
Registrar/loguear, token persiste, las rutas protegidas rechazan sin token (401) y aceptan
con token. **PAUSA.**

---

## ETAPA 5 — Deploy

### 5.1 Base a Postgres (Supabase)
- Cambiar `datasource` del schema a `postgresql`, `DATABASE_URL` de Supabase (cambio ~1 línea).
- `prisma db push` contra Postgres. Verificar que todo el flujo anda igual.

### 5.2 Deploy
- Backend + frontend en Render. Variables de entorno (`DATABASE_URL`, `JWT_SECRET`,
  `VITE_API_URL` apuntando al backend desplegado). CORS al dominio del frontend.

### ✅ CHECKPOINT 5
Usar la app desde el celular contra producción de punta a punta. **FIN V1.**

---

## Riesgos / guardrails (para que las etapas no se pisen)
- **Prisma queda en 6.x.** No subir a 7 (rompe config e import del cliente).
- Cada etapa se cierra con su checkpoint **probado de verdad** antes de abrir la siguiente;
  el backend no se vuelve a tocar una vez verde salvo bug.
- `web/` y `api/` son carpetas independientes; no comparten estado más que vía HTTP + tipos.
- Mantener el doc maestro (`README.md`) sincronizado al cerrar cada etapa (§10 roadmap).
- Sin `any` injustificado, sin `console.log` en código terminado, envelope siempre,
  4 estados siempre, mobile-first siempre.

## Verificación global (checklist de CLAUDE.md, al cierre de cada etapa)
□ Modelo de datos + `db push` (si tocó tablas) · □ endpoints con envelope ·
□ endpoints probados de verdad · □ API frontend tipada · □ 4 estados ·
□ mobile-first · □ sin console.log · □ sin any sin justificar · □ nombres consistentes.
