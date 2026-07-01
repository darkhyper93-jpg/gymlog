# Plan — Semana de carga/descarga + predicción de carga por ejercicio

> **DECISIONES YA RESUELTAS por Santi (2026-07-01), reemplazan la sección "Decisiones
> abiertas" al final de este documento:**
> - **#1/#4** — Ciclo reactivo por rendimiento (opción A): sin semanas fijas ni fechas
>   ancla, el deload se sugiere cuando el motor detecta meseta. Cero estado de tiempo.
> - **#2** — El feature es **por rutina**, no por usuario: `Routine.autoDeloadEnabled`
>   (default off). El guard cuenta los ejercicios de ESA rutina (los de sus días) sin
>   ninguna serie con peso.
> - **#3** — Nada se auto-aplica: las sugerencias de carga y la de deload son solo
>   sugerencias; ningún endpoint ni el motor escriben en la base.
> - El deload es **global por rutina** (un aviso, no por ejercicio).
> - Endpoint de activación: se extiende `PATCH /routines/:id` (no un router `/me`).

---

## Context

Santi quiere el feature más alineado con la visión original de gymlog (comparar lo hecho vs.
lo planeado): **autorregulación + predicción de carga**, descrito en
`ANALISIS-IDEAS-Y-SEGURIDAD.md` Parte 6, puntos 10–11. Son dos caras de lo mismo:

- **Punto 11 — Predicción de carga (por ejercicio, por sesión):** doble progresión + RIR. Te
  dice qué hacer la próxima vez en cada ejercicio: **subir / mantener / bajar**.
- **Punto 10 — Autorregulación (periodización):** detectar meseta y sugerir una **semana de
  descarga (deload)** cuando el progreso se aplana.

Es "postre" (el núcleo V1/V2 ya está shipeado y en uso), y el "ataque" acá no es un hacker sino
la **mala calidad de datos**: una sugerencia equivocada en el gym tiene consecuencias reales
(lesión, frustración). Por eso el diseño es deliberadamente conservador y siempre "sugerencia,
vos decidís".

### Requisitos NO negociables de Santi

- **(a)** Es un **toggle por usuario**, activable y desactivable, **DEFAULT DESACTIVADO**.
- **(b)** Solo se puede **activar** cuando exista **al menos un peso registrado en cada
  ejercicio** (validado en el backend, no solo en la UI).
- **(c)** El **motor de análisis es una función pura / endpoint de solo lectura que NO escribe
  en la base**. Degrada elegante cuando falta RIR, exige un mínimo de sesiones antes de sugerir,
  usa incrementos conservadores (~+2.5 kg) y **SIEMPRE** se presenta como *"sugerencia, vos
  decidís"*, nunca como orden.

---

## Arquitectura (cómo encaja en el stack actual)

Tres piezas, desacopladas:

1. **Motor puro** (`api/src/analysis.ts`): funciones puras, sin Prisma, sin Express, testeables
   con datos de ejemplo. Reciben el histórico ya cargado y devuelven un diagnóstico. **No
   escriben nada.**
2. **Endpoints de solo lectura** (`/analysis/...`): leen con Prisma (scoping por `userId`), arman
   las "sesiones" agrupando por día local, llaman al motor puro y devuelven el envelope. **No
   escriben nada.**
3. **Settings del usuario** (`/me`): el único que escribe, y solo el toggle + config del ciclo.
   Es estado de preferencias, no "el motor de análisis" → no viola (c). Acá vive el guard (b).

Esto respeta CLAUDE.md: liviano (un archivo de rutas por entidad, sin capas), envelope
uniforme, scoping por `userId`, validación de input, mobile-first, TS sin `any`.

### Reutilización concreta

- `est1RM(weight, reps) = weight * (1 + reps/30)` — hoy duplicado en `api/src/sets.ts:15` y
  `web/src/components/ProgressScreen.tsx:16`. **Centralizar** en `api/src/analysis.ts` y que
  `sets.ts` lo importe de ahí (el front mantiene su copia; no hay paquete compartido api/web y
  crear uno sería sobre-ingeniería para esta app — anotar como decisión inline).
- `dayBoundsMVD` / `localDayKeyMVD` (`api/src/time.ts`) para agrupar series en sesiones por día
  Uruguay — mismo criterio que `/exercises/:id/last` (`api/src/exercises.ts:158`) y ProgressScreen.
- `HttpError` / `ok` (`api/src/http.ts`), `getUserId` + `findFirst({ id, userId })` (patrón
  anti-IDOR de `api/src/body-weight.ts`), `apiRequest` (`web/src/api/client.ts`), `Modal`/`Card`/
  `Button`/`Toggle` de `web/src/components/ui.tsx`, tokens en `web/src/index.css`.

---

## Modelo de datos (mínimo)

**Cierto (independiente de las decisiones abiertas):**

```prisma
model User {
  // ...campos actuales...
  autoDeloadEnabled Boolean @default(false)   // (a) toggle, DEFAULT OFF
}
```

**Contingente a la decisión #1/#4 (cómo se trackea el ciclo):** una de estas dos formas —
Santi elige en las Decisiones Abiertas. Ambas son mínimas:

- **Opción time-based:** `cycleAnchorDate DateTime?` + `loadWeeks Int @default(3)`. La fase
  (carga/deload) se computa: semanas desde el ancla `% (loadWeeks + 1)`; la última = deload. El
  ancla se setea al prender el toggle. Requiere 1 campo escribible.
- **Opción performance-based (recomendada):** **cero campos extra**. La fase se computa 100%
  read-only desde el histórico (meseta detectada → deload sugerido). Más fiel al espíritu
  data-driven y no agrega nada que escribir.

`npx prisma db push` solo si se agrega algún campo (Postgres en prod; el toggle es un `Boolean`
con default, migración trivial y no rompe usuarios existentes).

---

## Fases

### Fase 0 — Setup
- Guardar este plan como `.claude/plans/subir-bajar-peso.md`.
- Actualizar `README.md` (§4 alcance post-V2, §6 modelo, §7 endpoints, §11 decisiones) **antes**
  de codear, según regla de CLAUDE.md ("no implementar algo que no está en README sin
  actualizarlo primero").

### Fase 1 — Motor puro (`api/src/analysis.ts`)
Solo funciones puras, exportadas y testeables. Sin Prisma/Express.

- `est1RM(weight, reps)` — centralizado acá; `sets.ts` lo importa.
- Tipos: `SessionSummary` (peso top, mejor 1RM, reps del top set, rir del top set, fecha) y
  `LoadSuggestion { action: 'subir'|'mantener'|'bajar'|'sin-datos'; suggestedWeight?: number;
  rationale: string; confidence: 'alta'|'media'|'baja'; rirUsed: boolean }`.
- `summarizeSessions(sets)` → agrupa series por día en sesiones, filtra outliers (peso ≤ 0,
  reps ≤ 0, valores absurdos). **No** agrupa por fecha acá si ya vienen agrupadas del endpoint;
  decidir dónde agrupar (ver nota de reutilización de `time.ts`).
- `suggestLoad(sessions, { targetReps?, minSessions = 3, increment = 2.5 })` → **punto 11**,
  doble progresión + RIR:
  - Cumplió reps objetivo con **RIR ≥ 2** → `subir` (+`increment` kg, o +reps si no hay objetivo claro).
  - **RIR 0–1** o justo en el objetivo → `mantener`.
  - No llegó a las reps / RIR 0 fallando → `mantener` o `bajar`.
  - **Degradación sin RIR:** si las series no tienen `rir`, cae a "reps vs. objetivo + tendencia
    de 1RM estimado" y baja `confidence` a `media/baja` + `rirUsed: false`.
  - **Mínimo de sesiones:** si `sessions.length < minSessions` → `action: 'sin-datos'` con
    rationale explicando cuántas faltan.
- `detectStall(sessions, { window = 3 })` → **punto 10**: mejor set / 1RM estimado por sesión;
  si no mejora en `window` sesiones seguidas → meseta → sugiere deload (bajar volumen/intensidad
  ~10–20% una semana). Degrada igual con pocos datos.
- **Todos los umbrales** (`minSessions`, `increment`, `window`, % de deload) como constantes
  nombradas arriba del archivo, no mágicos dispersos.

### Fase 2 — Endpoints de solo lectura (`api/src/analysis.ts` router + montaje)
Todos `requireAuth`, scoping por `userId`, envelope, **cero escrituras**.

- `GET /analysis/exercise/:id` — sugerencia de un ejercicio.
  - `exercise = findFirst({ id, userId })` → 404 si no es tuyo (anti-IDOR).
  - Lee sus series, arma sesiones por día local, corre `suggestLoad` (+ `detectStall`).
  - `data: LoadSuggestion` (incluye `sin-datos` como estado válido, no error).
- `GET /analysis/deload` — estado de periodización del usuario (fase actual carga/deload + si se
  sugiere deload ahora). Forma exacta depende de la decisión #4. Read-only.
- (Opcional, postre) `GET /analysis/overview` — sugerencia de todos los ejercicios para un panel.
- Montar en `server.ts`: `app.use('/analysis', requireAuth, analysisRouter);` junto al resto.

### Fase 3 — Settings + guard del toggle (`api/src/me.ts` router protegido nuevo)
El **único** que escribe. Router separado (no en `authRouter`, que es público + rate-limited).

- `GET /me` → `data: { autoDeloadEnabled, ...configCiclo }`.
- `PATCH /me` → valida body (`autoDeloadEnabled: boolean`, etc.), aplica.
  - **Guard (b), server-side:** al intentar **activar**, contar ejercicios del usuario **sin
    ninguna serie con peso registrado**; si hay ≥ 1 → `HttpError(400, ...)` con mensaje claro
    (cuántos/ cuáles faltan). El *scope* de "cada ejercicio" (todos vs. rutina activa) sale de la
    **Decisión #2**. **Desactivar** nunca se bloquea.
  - Si la config del ciclo es time-based: al pasar de off→on, setear `cycleAnchorDate = now()`.
- Montar en `server.ts`: `app.use('/me', requireAuth, meRouter);`.

### Fase 4 — Frontend: API + hooks
- `web/src/api/analysis.ts` — `getExerciseSuggestion(id)`, `getDeloadStatus()` tipados (usan
  `apiRequest`). Tipos en `web/src/types.ts`.
- `web/src/api/settings.ts` — `getMe()`, `updateSettings(patch)`.
- `web/src/hooks/useSettings.ts` — `autoDeloadEnabled`, `toggle()`, y estado de elegibilidad
  (qué ejercicios faltan) para renderizar el toggle deshabilitado con explicación.
- `web/src/hooks/useSuggestion.ts` — sugerencia por ejercicio para RegisterScreen (con los 4 estados).

### Fase 5 — Frontend: UI mobile-first (4 estados: cargando · vacío · error · con datos)
- **Toggle de autorregulación:** modal desde el header (mismo patrón que
  `NotificationSettings.tsx` / `Modal` de `ui.tsx`), o card en Progreso — a definir en Decisión #5.
  - *con datos:* switch on/off + copy "Sugerencias de carga y deload. Vos decidís siempre."
  - *vacío/ineligible:* switch deshabilitado + lista de ejercicios sin peso registrado ("Cargá
    al menos una serie en: …") — materializa el guard (b) en la UI.
  - *cargando / error:* spinner / mensaje con retry.
- **Sugerencia por ejercicio (RegisterScreen):** card arriba del `SetForm` cuando el toggle está
  ON. `subir` en `--color-accent`, con reps/peso sugerido y rationale.
  - *sin-datos:* "Necesitás N sesiones más para una sugerencia."
  - *sin RIR:* copy degradado ("Sin RIR cargado; sugerencia con menor confianza").
  - Siempre el sello "Sugerencia — vos decidís", nunca imperativo.
- **Banner de deload:** aviso no intrusivo y **descartable** cuando se sugiere semana de descarga
  ("Semana de descarga sugerida: bajá volumen/intensidad ~10–20% esta semana. Vos decidís.").
  Si auto-aplica al plan o solo sugiere = **Decisión #3** (recomendado: solo sugiere).
- Reusar tokens de `web/src/index.css`; sin colores hardcodeados; botones grandes; pocos toques.

---

## Verificación

1. **Tipos + build:** `tsc --noEmit` en `api/` y `web/`; `npm run build` en `web/`. Sin `any`
   sin justificar, sin `console.log`.
2. **Tests del motor puro** (`api/src/analysis.test.ts`, con `node --test` + tsx — Node 24 lo
   trae nativo; el repo hoy no tiene runner, esto es lo más liviano):
   casos `subir` (reps ok + RIR≥2), `mantener` (RIR 0–1), `bajar` (falló reps), **sin RIR**
   (degradación), **pocas sesiones** (`sin-datos`), **outliers** (serie en 0 ignorada), meseta
   detectada → deload.
3. **e2e local (NUNCA contra prod — ver `ANALISIS...` Parte 2, punto 7):**
   - Usuario descartable → ejercicio con histórico conocido → `GET /analysis/exercise/:id` da la
     acción esperada.
   - Guard: intentar `PATCH /me { autoDeloadEnabled: true }` con un ejercicio sin series → **400**;
     cargar una serie → ahora **200** y queda activado.
   - IDOR: `GET /analysis/exercise/:idAjeno` con token propio → **404**.
4. **delta-audit** (skill) sobre el diff antes de commitear: confirmar scoping por `userId` en
   `/analysis` y `/me`, guard server-side, sin fugas de datos ajenos, envelope intacto, y que los
   endpoints de análisis efectivamente **no** escriben.

---

## DECISIONES ABIERTAS (las decide Santi — NO están resueltas)

Ordeno cada una con opciones y una recomendación arquitectónica, pero **ninguna está elegida**:

**#1 — ¿Qué define una "semana de carga" vs. "descarga" y cómo se trackea el ciclo?**
- (A) *Performance-based (recomendada):* no hay semanas fijas; el deload se sugiere cuando el
  motor detecta meseta. Cero estado persistido, 100% read-only.
- (B) *Time-based:* mesociclo fijo (ej. 3 semanas carga + 1 deload), anclado a `cycleAnchorDate`
  al prender el toggle. Simple y predecible, pero ignora cómo venís rindiendo.
- (C) *Híbrido:* time-based con override si hay meseta antes de tiempo.

**#2 — "Cada ejercicio" del guard (b): ¿todos los del usuario o solo los de la rutina activa?**
- (A) *Todos los ejercicios del usuario* con ≥1 serie con peso. Más estricto; si tenés ejercicios
  viejos sin uso, bloquea. (¿Se ignoran ejercicios "archivados"? no existe ese concepto hoy.)
- (B) *Solo los de la rutina activa.* Pero **no existe** el concepto de "rutina activa" hoy (hay
  varias `Routine` sin una marcada como activa) → habría que definirlo primero.

**#3 — La semana de descarga: ¿se auto-aplica al plan o solo se sugiere?**
- (A) *Solo sugiere (recomendada):* banner/aviso, vos ajustás. Coherente con "vos decidís" y con
  el requisito (c) de no escribir.
- (B) *Auto-aplica:* modifica el plan/target de los ítems esa semana. Implica **escribir** →
  chocaría con (c) salvo que sea una acción explícita del usuario ("aplicar deload"), no del motor.

**#4 — ¿Qué señal exacta dispara pasar de carga a descarga?**
- (A) *Meseta de rendimiento:* mejor set / 1RM estimado sin mejorar en N sesiones (ej. 3–4)
  en el/los ejercicio(s) principal(es). ¿Meseta por-ejercicio o global del mesociclo?
- (B) *Fatiga por RIR:* RIR promedio cayendo (te cuesta más el mismo peso) por X sesiones.
  Depende de que cargues RIR (opcional en la app) → menos robusto.
- (C) *Tiempo:* cada N semanas, sí o sí (empareja con #1-B).
- Además: ¿el deload es **global** (toda la semana) o **por ejercicio** (solo los estancados)?

**#5 — ¿Dónde vive el toggle en la UI?**
- (A) *Modal desde el header* (patrón `NotificationSettings`). (B) *Card en la pantalla Progreso.*
  (C) *Nueva mini-pantalla/tab "Ajustes".*

**Extras a confirmar (menores):**
- Umbrales por defecto: `minSessions = 3`, `increment = 2.5 kg`, ventana de meseta = 3 sesiones,
  deload = −10–20%. ¿OK o los tocás?
- ¿La sugerencia se muestra **solo** en RegisterScreen, o también un panel "overview" (postre)?
