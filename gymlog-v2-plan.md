# gymlog V2 — Plan de ejecución (handoff para un agente nuevo, fuera de contexto)

> Este documento está **dirigido al agente que va a implementar el V2** (Sonnet 4.6, effort
> medio). Es autocontenido: leelo entero antes de tocar nada. El qué, el orden y las reglas
> están todas acá. Las features se construyen **por etapas con checkpoints** — no abras la
> siguiente sin cerrar la anterior con su verificación.

---

## Context (por qué este plan)

El **V1 de gymlog está terminado y en producción** (registrar series, ejercicios por grupo
muscular, login, datos por usuario, deploy en Render + Supabase). El dueño quiere ahora sumar
**las 5 features que el V1 dejó como "postre"** (README §4), con una condición central: la
**rutina la arma él a mano** en la web a partir de sus propios ejercicios — **nada de generación
automática**. Y todo debe **mantener la estética actual** (rediseño portado de Stitch: dark
premium, Inter, tokens centralizados, cards con hover, chips, modales, acento naranja para el
RIR). Las features nuevas viven en **pantallas nuevas** accesibles por una navegación nueva, sin
romper lo que ya anda.

Features a construir: **(1) Rutinas personalizadas con sub-días · (2) Timer de descanso por
ejercicio · (3) Gráficos de progreso · (4) PRs auto-detectados con celebración · (5) Logros.**

---

## CÓMO TRABAJAR (leé esto antes de tocar nada)

**Documentos maestros — leelos completos primero, son la fuente de verdad:**
1. `README.md` — el documento maestro del proyecto (objetivo, stack, modelo de datos, endpoints,
   roadmap §10, decisiones §11). CLAUDE.md lo llama `gymlog-proyecto.md`.
2. `CLAUDE.md` — cómo comportarte (reglas innegociables). **Tiene prioridad sobre tu criterio.**
3. Este archivo (`gymlog-v2-plan.md`) — el qué y el orden.

**Reglas innegociables (de CLAUDE.md) — se verifican en cada checkpoint:**
- **TypeScript sin `any`** sin comentario que lo justifique. Tipar todo lo que cruza frontera.
- **Validar input externo** (body/params/query) antes de tocar la base.
- **Envelope uniforme**: éxito → `ok(res, data, status?)` (`{ success:true, data }`); error →
  tirar `HttpError(status, msg)` (`api/src/http.ts`); el handler central de `server.ts` arma
  `{ success:false, error }`. **Ningún endpoint devuelve datos crudos.**
- **Datos por usuario, SIEMPRE.** Toda tabla nueva lleva `userId` (relación a `User`,
  `onDelete: Cascade`) y **todos** los endpoints filtran por el usuario del token con
  `getUserId(req)` + `findFirst({ where: { id, userId } })`. Pedir algo ajeno → **404** (no se
  filtra que existe). Es CRÍTICO: el dueño exige aislamiento total entre usuarios.
- **4 estados** en cada pantalla con datos: cargando · vacío (empty state con CTA) · error (con
  reintento) · con datos. Nunca pantalla en blanco.
- **Mobile-first**: targets ≥48px, pocos toques, columnas que se apilan en celu.
- **Estética**: reusar las primitivas de `web/src/components/ui.tsx` (`Button`, `IconButton`,
  `Card`, `Chip`, `Modal`, `SectionLabel`, `NumberField`, `TextInput`, `StateView`, `Spinner`) y
  los iconos SVG de `web/src/components/icons.tsx`. **Iconos SVG inline estilo Lucide, NUNCA
  emojis.** Colores/tipografía SOLO vía tokens de `web/src/index.css` (`bg-brand`, `text-fg`,
  `text-muted`, `bg-surface`, `border-border`, `text-accent`, `bg-surface-lowest`, etc.). Nada
  hardcodeado suelto.
- **Prisma fijado en 6.x.** No subir a 7.x (rompe config e import del cliente).
- **Sin `console.log`** en código terminado (salvo el log de arranque ya existente en server.ts).
- **Estructura liviana**: un router por entidad en `api/src/<entidad>.ts` montado en `server.ts`;
  una función de API por endpoint en `web/src/api/<entidad>.ts`; un hook de datos por pantalla en
  `web/src/hooks/`. **No** inventar capas controller/service/repository.
- **Decisiones no triviales** → comentario inline `// DECISIÓN: ...` y, si es de arquitectura,
  anotarla en `README.md` §11.

**Orden por feature (de CLAUDE.md), aplicalo en cada etapa:**
`README primero (doc maestro) → schema.prisma (+ db push) → endpoints backend → probar endpoints
de verdad → api/ tipada en frontend → hook → componentes con los 4 estados (mobile-first)`.

**⚠️ Base de datos = producción.** El `datasource` ya apunta a **Postgres de Supabase** (la misma
base se usa en dev y prod; no hay SQLite). Por lo tanto **`npx prisma db push` modifica la base de
producción**. Por política del proyecto, **NO corras `db push` por tu cuenta: prepará el schema,
frená y pedile autorización explícita al dueño** (él lo corre o te lo aprueba). Lo mismo para
cualquier migración. Las tablas nuevas son aditivas (no rompen datos), pero igual se pide OK.

**Patrones exactos a imitar (ya existen, copialos):**
- Backend router: `api/src/exercises.ts` y `api/src/sets.ts` (validación con `parseXBody`,
  `getUserId`, `findFirst` por dueño, `ok()`).
- Frontend api: `web/src/api/exercises.ts` + `web/src/api/client.ts` (`apiRequest<T>` ya
  desempaqueta el envelope y adjunta el token; un 401 limpia sesión).
- Hook con 4 estados + alta optimista: `web/src/hooks/useExercises.ts` y `useRegister.ts`.
- Agrupación por día local (no UTC): `localDayKey()` en `useRegister.ts` — reusá ese criterio
  para gráficos y stats (entrenar es un evento local).
- Pantallas: `web/src/components/ExercisesScreen.tsx` y `RegisterScreen.tsx` (estructura visual,
  uso de `Card`/`Chip`/`Modal`/`SectionLabel`, los 4 estados).

---

## DECISIONES DE PRODUCTO (ya tomadas con el dueño — no las re-preguntes)

1. **Rutinas con sub-días.** Una `Routine` (ej. "Push/Pull/Legs") contiene varios `RoutineDay`
   (ej. "Día A - Empuje"), y cada día tiene una lista **ordenada** de ejercicios del usuario.
2. **PRs auto-detectados + celebración.** Se derivan del historial: **peso máximo** y **1RM
   estimado** (Epley: `weight * (1 + reps/30)`) por ejercicio. Cuando una serie nueva supera el
   récord, se festeja (toast). Sin carga manual de PRs.
3. **Timer de descanso por ejercicio.** `Exercise` gana `restSeconds Int?` (objetivo de descanso,
   nullable). El timer arranca con ese valor al cargar una serie en "Registrar hoy".
4. **Logros definidos por el agente** según la lista de la Etapa 5 (el dueño la ajusta después).
5. **Navegación nueva** estilo Stitch: **bottom-nav en celular / top-nav en desktop** con 4
   secciones — **Ejercicios · Rutinas · Progreso · Logros**. "Registrar hoy" sigue siendo una
   sub-vista que se abre al tocar un ejercicio (botón ← para volver).

---

## MODELO DE DATOS NUEVO (`api/prisma/schema.prisma`)

Agregar (Postgres, Prisma 6.x). Mantener el estilo de los modelos existentes (cuid, createdAt).

```prisma
model Exercise {
  // ...campos existentes...
  restSeconds  Int?                  // descanso objetivo en segundos (timer); null = sin preferencia
  routineItems RoutineDayExercise[]  // back-relation
}

model User {
  // ...campos existentes...
  routines     Routine[]
  achievements UserAchievement[]
}

model Routine {
  id        String       @id @default(cuid())
  name      String
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  order     Int          @default(0)
  createdAt DateTime     @default(now())
  days      RoutineDay[]
}

model RoutineDay {
  id        String               @id @default(cuid())
  name      String
  routine   Routine              @relation(fields: [routineId], references: [id], onDelete: Cascade)
  routineId String
  order     Int                  @default(0)
  exercises RoutineDayExercise[]
}

model RoutineDayExercise {
  id           String     @id @default(cuid())
  day          RoutineDay @relation(fields: [routineDayId], references: [id], onDelete: Cascade)
  routineDayId String
  exercise     Exercise   @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  exerciseId   String
  order        Int        @default(0)
}

model UserAchievement {
  id         String   @id @default(cuid())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId     String
  key        String   // clave de la definición estática (api/src/achievements.ts)
  unlockedAt DateTime @default(now())
  @@unique([userId, key])
}
```

Integridad por usuario: `Routine.userId` es el dueño. `RoutineDay` y `RoutineDayExercise` cuelgan
de la rutina (separados por usuario de forma transitiva). Al agregar un ejercicio a un día,
**verificar en el endpoint que el ejercicio sea del usuario** (`findFirst({id, userId})`); si no
→ 404.

---

## ETAPAS (cada una cierra con su checkpoint probado; no abrir la siguiente sin cerrar la anterior)

### ETAPA 0 — Preparación (sin features)
- Leé `README.md` y `CLAUDE.md` completos. Confirmá el estado actual.
- Creá una rama de trabajo: `git checkout -b v2-postre` (no trabajar sobre `main` directo).
- Baseline en verde: `cd web && npm run build` y `cd api && npx tsc --noEmit` deben pasar **antes**
  de empezar. Si no pasan, frená y reportá.
- **Checkpoint 0:** builds verdes + rama creada. **PAUSA** breve (informá y seguí).

### ETAPA 1 — Navegación / shell (foundational, sin backend)
Objetivo: meter las 4 secciones sin romper nada, para colgar las features después.
- **Iconos** (`web/src/components/icons.tsx`): agregá SVG estilo Lucide (viewBox 24, trazo
  currentColor, usando el `Base` existente): `CalendarIcon` (Rutinas), `TrendingUpIcon`
  (Progreso), `TrophyIcon` (Logros), `TimerIcon`, `ChevronUpIcon`/`ChevronDownIcon` (reordenar).
  (Ejercicios reusa `DumbbellIcon`.)
- **Tab bar** (`web/src/components/NavBar.tsx`, nuevo): bottom-nav fija en mobile
  (`fixed bottom-0`, `bg-surface-lowest`, `border-t border-border`, items con icono+label, activo
  en `text-brand` con `bg-brand-soft` redondeado) y, en `md+`, los mismos 4 links en el header
  (top-nav). Reutilizá el patrón visual del header actual de `App.tsx`. Targets ≥48px.
- **`App.tsx`**: convertí el `view` actual en un shell con estado de **tab** (`'ejercicios' |
  'rutinas' | 'progreso' | 'logros'`) + sub-vista `register` (que se abre desde Ejercicios o desde
  un día de rutina, con back). Mantené el header fijo (wordmark "gymlog" en `text-brand` + logout)
  y el ancho adaptativo (`max-w-md` mobile, más ancho en listas). Agregá padding-bottom al `main`
  para que la bottom-nav no tape contenido. **No** router lib (sigue la decisión del V1: estado de
  vista alcanza).
- Pantallas nuevas como **placeholders** por ahora (Rutinas/Progreso/Logros muestran un empty
  state "Próximamente" con su icono) — se llenan en sus etapas.
- **Checkpoint 1:** `npm run build` verde. Navegás entre las 4 tabs en responsive (375px y
  desktop), la bottom-nav no tapa nada, Ejercicios y Registrar hoy siguen andando igual. **PAUSA.**

### ETAPA 2 — Rutinas (con sub-días)
- **README primero**: §4 (sumar rutinas al alcance), §6 (modelos Routine/RoutineDay/
  RoutineDayExercise), §7 (endpoints), §11 (decisión sub-días + ordenamiento por `order`).
- **schema**: agregá los 3 modelos de rutina (arriba). **Pedí autorización para `db push`** (DB =
  prod). Tras el push, `npx prisma generate` (si da EPERM en Windows, matá procesos node salvo
  Vite y reintentá).
- **Backend** (`api/src/routines.ts`, nuevo router montado en `server.ts` con `requireAuth`):
  - `GET /routines` — tus rutinas con days (orderBy order) y, en cada día, sus ejercicios (incluí
    el Exercise para mostrar nombre/grupo). `include` anidado, todo filtrado por userId.
  - `POST /routines` — `{ name }` → crea rutina vacía tuya.
  - `PATCH /routines/:id` — renombrar/reordenar (`{ name?, order? }`). 404 si no es tuya.
  - `DELETE /routines/:id` — borra (days/items caen por cascade). 404 si no es tuya.
  - `POST /routines/:id/days` — `{ name }` → agrega un día. Verificá dueño de la rutina.
  - `PATCH /routine-days/:dayId` / `DELETE /routine-days/:dayId` — renombrar/reordenar/borrar día.
    Verificá que el día pertenezca a una rutina tuya (join por userId).
  - `POST /routine-days/:dayId/exercises` — `{ exerciseId }` → agrega ejercicio al día. **Verificá
    que el ejercicio sea tuyo** (404 si no). Asigná `order` = (max actual + 1).
  - `PATCH /routine-day-exercises/:itemId` (reordenar, `{ order }`) y
    `DELETE /routine-day-exercises/:itemId` (quitar del día). Verificá dueño transitivo.
  - Validá todo body con un `parseXBody` (como en exercises.ts). Envelope siempre.
  - Decidí montaje de rutas: podés usar prefijos `/routines`, `/routine-days`,
    `/routine-day-exercises`; mantené las URLs coherentes.
- **Probar de verdad** (curl / Invoke-RestMethod, con token real): crear rutina → día → agregar 2
  ejercicios → GET anidado correcto → reordenar → quitar uno → borrar día → borrar rutina. Probar
  que un ejercicio ajeno da 404. Inputs inválidos → 400.
- **Frontend**:
  - `web/src/types.ts`: tipos `Routine`, `RoutineDay`, `RoutineDayExercise` (con el Exercise
    embebido).
  - `web/src/api/routines.ts`: funciones tipadas por endpoint (patrón de `api/exercises.ts`).
  - `web/src/hooks/useRoutines.ts`: 4 estados + CRUD (patrón `useExercises.ts`).
  - `web/src/components/RoutinesScreen.tsx`: lista de rutinas (Card por rutina, con sus días como
    sub-secciones; cada día lista sus ejercicios con nombre + chip de grupo). Acciones: crear
    rutina (Modal), agregar día, agregar ejercicio al día (Modal con selector de tus ejercicios),
    **reordenar con botones ↑/↓** (sin lib de drag, mobile-first), renombrar/borrar. Desde un
    ejercicio de un día, botón "Registrar hoy" que abre la sub-vista register. Los 4 estados
    (incluí empty state "Todavía no armaste rutinas" con CTA).
- **Checkpoint 2:** build verde + flujo real en el navegador: armás una rutina con 2 días y
  ejercicios, reordenás, y desde un día entrás a registrar. **PAUSA.**

### ETAPA 3 — Timer de descanso (por ejercicio)
- **README**: §6 (campo `restSeconds`), §11 (decisión: timer client-side que arranca con el
  descanso objetivo del ejercicio).
- **schema**: `Exercise.restSeconds Int?`. Pedí autorización para `db push` + `generate`.
- **Backend**: en `parseCreateBody`/`parseUpdateBody` de `exercises.ts` aceptá y validá
  `restSeconds` (entero ≥ 0, opcional/nullable). Incluilo en create/update.
- **Frontend**:
  - `types.ts` + `api/exercises.ts` + `ExerciseForm.tsx`: sumá el campo `restSeconds` (un
    `NumberField` "Descanso (seg)" opcional). `useExercises` ya pasa el input entero.
  - `web/src/components/RestTimer.tsx` (nuevo): cuenta regresiva mobile-first. Arranca en
    `exercise.restSeconds` (si existe) o un preset; controles grandes (start/pausa/reset,
    +15s/-15s, presets 60/90/120/180). Al llegar a 0: vibración (`navigator.vibrate`, con guarda)
    + aviso visual. Usá tokens (anillo de progreso en `text-brand`, números `.tabular`).
  - En `RegisterScreen.tsx`: al **agregar una serie** (alta optimista exitosa), arrancá el timer
    automáticamente con el descanso del ejercicio. Mostralo de forma no intrusiva (card propia o
    barra fija sobre la bottom-nav). Mantené los 4 estados existentes intactos.
- **Checkpoint 3:** build verde; cargás una serie y el timer arranca con el descanso del
  ejercicio, podés pausar/reiniciar/ajustar, y avisa al terminar. **PAUSA.**

### ETAPA 4 — Progreso (gráficos) + PRs auto
- **README**: §4/§6/§7/§11 (gráficos derivados del historial; PRs por Epley; sin tablas nuevas
  para PRs — se calculan).
- **1RM estimado**: helper `est1RM(weight, reps) = weight * (1 + reps/30)` (Epley). Documentá la
  fórmula con `// DECISIÓN:`.
- **Backend** (podés derivar en el cliente desde `GET /exercises/:id/sets` que YA existe, o
  exponer un endpoint; elegí lo más simple y consistente — si agregás endpoint, va con envelope y
  scoping):
  - PRs por ejercicio: `maxWeight` y `best1RM` (con la serie donde ocurrió). Vía
    `GET /exercises/:id/prs` → `{ maxWeight: {...} | null, best1RM: {...} | null }` o calculado en
    el hook desde el historial. **Elegí una sola vía y dejala consistente.**
  - **Celebración de PR**: en `POST /sets` (`api/src/sets.ts`), antes de crear, calculá el récord
    previo del ejercicio (maxWeight, best1RM sobre las series existentes); creá la serie; determiná
    `weightPR`/`oneRmPR` (la nueva supera al previo, o no había). **Devolvé un payload
    enriquecido**: `ok(res, { set, prs: { weightPR, oneRmPR }, achievements: [...] }, 201)` (el
    array de logros lo llena la Etapa 5; por ahora `[]`). Actualizá `web/src/api/sets.ts`,
    `useRegister.ts` (manejar el nuevo shape; seguir mostrando la serie igual) y disparar un
    **toast de PR** cuando `weightPR`/`oneRmPR`. Cuidado de no romper el alta optimista.
  - Toast: `web/src/components/Toast.tsx` (o un mini contexto) reutilizable, mobile-first,
    autodismiss, con icono `TrophyIcon`. Tokens/estética.
- **Gráfico**: `web/src/components/ProgressChart.tsx` (SVG a mano, **sin dependencia nueva**):
  recibe puntos `{ date, value }[]` y dibuja línea + puntos en `text-brand`, ejes mínimos, labels
  min/max con `.tabular`, responsive por `viewBox`. 4 estados (sin datos → empty).
  - `ProgressScreen.tsx`: elegí un ejercicio (lista reusando `useExercises`) → mostrá sus **PR
    cards** (peso máx, 1RM est.) + el gráfico con **toggle de métrica**: Top set (peso máx del
    día) · Volumen (Σ peso×reps del día) · 1RM est. (máx del día). Agrupá por **día local** (reusá
    el criterio de `localDayKey`).
- **Checkpoint 4:** build verde; entrás a Progreso, elegís un ejercicio con historial, ves PRs y
  el gráfico con los 3 toggles; al cargar una serie que supera el récord, salta el toast de PR.
  **PAUSA.**

### ETAPA 5 — Logros
- **README**: §4/§6/§7/§11 (modelo `UserAchievement`, motor de evaluación, lista de logros).
- **schema**: `UserAchievement` (arriba). Pedí autorización para `db push` + `generate`.
- **Definiciones** (`api/src/achievements.ts`, nuevo): array `ACHIEVEMENTS` de
  `{ key, title, description, icon }` (estáticas, en código) + una función `evaluate(stats)` que
  recibe stats del usuario y devuelve las claves que cumplen condición. Stats a calcular desde la
  base (todas filtradas por userId): `totalSets`, `trainingDays` (días calendario distintos con
  series — usá fecha local del server, mismo criterio que `/last`), `currentStreak` (días
  consecutivos entrenados hasta hoy), `totalVolume` (Σ weight×reps), `prCount` (opcional).
  **Set inicial sugerido (ajustable por el dueño):**
  - `first-workout` — primera serie registrada.
  - `workouts-10`, `workouts-30`, `workouts-100` — N días distintos entrenados.
  - `streak-3`, `streak-7` — N días consecutivos.
  - `volume-10k`, `volume-100k`, `volume-500k` — kg totales levantados.
  - `first-pr` — primer PR (peso o 1RM).
- **Motor**: en `POST /sets`, después de crear la serie (y calcular PRs de la Etapa 4), recalculá
  stats, evaluá qué logros **nuevos** se desbloquean (los que cumplen y no están en
  `UserAchievement`), insertalos (`@@unique([userId,key])` evita duplicados) y devolvé sus defs en
  el array `achievements` del payload de `POST /sets`. El frontend muestra un **toast de logro
  desbloqueado** (reusá el Toast de la Etapa 4).
- `GET /achievements` — todas las definiciones + si están desbloqueadas (con fecha) para el
  usuario. Envelope.
- **Frontend**: `api/achievements.ts` + `hooks/useAchievements.ts` (4 estados) +
  `AchievementsScreen.tsx`: grilla de logros (Card por logro: icono, título, descripción;
  desbloqueado en color/realce, bloqueado atenuado con candado). Empty state si la API falla.
- **Checkpoint 5:** build verde; registrás series y se desbloquean logros (toast + aparecen
  desbloqueados en la pantalla Logros). Verificá `first-workout` con un usuario nuevo. **PAUSA.**

### ETAPA 6 — Cierre / prod
- README §10: marcá las 5 features como hechas; §11 al día.
- Asegurate de que **todas** las migraciones de schema ya se aplicaron a Supabase (con
  autorización del dueño). Si algún `db push` quedó pendiente, frená y pedilo.
- `npm run build` (web) + `npx tsc --noEmit` (api) verdes. Sin `console.log`, sin `any`
  injustificado.
- **Commit + push** a la rama (no a `main` sin pedir): pedile al dueño cómo integrar (merge/PR).
  Recordale que **Render no auto-redeploya**: tras mergear a `main` tiene que disparar el deploy a
  mano (backend y frontend) y que el `db push` ya tocó la base de prod.
- **Checkpoint 6 / FIN V2:** el dueño prueba las 5 features en el celu contra prod.

---

## AUTO-VERIFICACIÓN (obligatoria en cada checkpoint)

Corré y confirmá **vos mismo** antes de declarar una etapa hecha (no asumas):
- **Build frontend**: `cd web && npm run build` (tsc -b + vite) → 0 errores.
- **Typecheck backend**: `cd api && npx tsc --noEmit` → exit 0.
- **Endpoints de verdad**: con el backend corriendo (`npx tsx src/server.ts`) y un token real,
  probá cada endpoint nuevo con curl/Invoke-RestMethod: caso feliz + un inválido (400) + uno
  ajeno/inexistente (404). Confirmá envelope `{ success, data }` / `{ success:false, error }`.
- **Aislamiento por usuario**: con 2 usuarios, confirmá que A no ve ni toca lo de B (404).
- **Checklist CLAUDE.md**: □ envelope · □ input validado · □ sin `any` injustificado · □ sin
  `console.log` · □ 4 estados · □ mobile-first (375px) · □ tokens (nada hardcodeado) · □ iconos
  SVG (no emojis) · □ Prisma 6.x · □ README actualizado.
- **Sintonía visual**: abrí en responsive 375px y desktop; las pantallas nuevas comparten el
  lenguaje de las viejas (mismas Card/Chip/Button/Modal/SectionLabel, mismo ritmo y tokens).
- Reportá al dueño, en cada checkpoint: **diff/resumen de cambios + una oración** de lo hecho.

## Riesgos / guardrails
- DB = prod: **nunca** `db push`/migración sin autorización explícita del dueño.
- No tocar el stack (React+Vite+Tailwind v4 / Express+TS / Prisma 6.x+Postgres). Sin libs de
  charts ni de drag&drop (hand-rolled SVG + botones ↑/↓).
- No romper lo del V1 (Ejercicios, Registrar hoy, Login, datos por usuario) — regresión cero.
- Las etapas no se pisan: cerrá con checkpoint verde antes de abrir la siguiente.
