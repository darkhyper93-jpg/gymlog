GYMLOG — DOCUMENTO MAESTRO DEL PROYECTO

Este archivo es la fuente de verdad de la app. Resume qué es, para quién, con qué está hecha,
cómo está organizada, qué endpoints tiene, en qué estado está y qué falta. Si abrís un chat
nuevo o volvés en otra sesión, leer esto te pone al día en dos minutos. (Nombre "gymlog" es
provisional, podés cambiarlo. Movelo a tu carpeta gymlog, por ejemplo como README.md.)


══════════════════════════════════════════════════════════════════════════════
1. QUÉ ES Y QUÉ PROBLEMA RESUELVE
══════════════════════════════════════════════════════════════════════════════

Una app personal para registrar lo que cargo en el gimnasio en cada ejercicio, sesión a
sesión, y poder comparar lo que realmente hice contra lo que la rutina decía.

El dolor real: hoy no tengo registro de los pesos, series, reps y RIR que hago. No me acuerdo
qué levanté la vez pasada, así que no sé qué tengo que superar, y cuando me desvío de la rutina
(por ejemplo, en vez de 4x8-10 hice 3x8 porque estaba cansado) eso se pierde. Lo parcheo con la
memoria o notas sueltas.

La solución mínima: anotar rápido lo que hice hoy en cada ejercicio y, al hacerlo, ver al lado
lo que hice la última vez (y mi objetivo). Eso convierte una libreta en una herramienta de
progreso.


══════════════════════════════════════════════════════════════════════════════
2. PARA QUIÉN Y CÓMO SE USA
══════════════════════════════════════════════════════════════════════════════

Usuario: yo (proyecto personal; eventualmente mi mejor amigo).

Contexto de uso: parado en el gimnasio, entre serie y serie, desde el celular, con una mano.
Por eso la decisión de diseño que manda sobre todo lo demás es MOBILE-FIRST: botones grandes,
y cargar una serie tiene que ser cuestión de dos o tres toques. La velocidad de carga es la
prioridad número uno de la interfaz.


══════════════════════════════════════════════════════════════════════════════
3. PRINCIPIOS (POR QUÉ ESTÁ HECHA ASÍ)
══════════════════════════════════════════════════════════════════════════════

· Núcleo primero, postre después. El V1 es login → acción → resultado y nada más. Toda idea
  "cool" extra se manda al freezer hasta que el núcleo funcione y se use.
· Construido por mí para aprender. El objetivo no es solo tener la app, es entender cada parte
  para poder leerla, cambiarla y debuggearla yo mismo. La IA es asistente, no jefe.
· Estructura proporcional al tamaño. Como es una app chica, NO se usan tres capas por entidad
  (controller/service/repository) como en proyectos grandes. Se mantiene liviano: una conexión
  a la base y un archivo de rutas por entidad.
· Un solo stack, sin cambiarlo. Se elige un stack conocido y no se anda saltando de tecnología.


══════════════════════════════════════════════════════════════════════════════
4. ALCANCE
══════════════════════════════════════════════════════════════════════════════

Entra en el V1:
· Lista de ejercicios: ver, agregar, editar (nombre y objetivo) y borrar.
· Cada ejercicio tiene un objetivo en texto opcional (ej. "4x8-10 RIR2").
· Registrar la sesión de hoy: elegir un ejercicio y cargar series (peso, reps, RIR).
· Al registrar, ver el objetivo y lo que se hizo la última vez en ese ejercicio.
· Login simple para que la app sea mía y ande desde el celu.

Queda FUERA del V1 (postre, para más adelante):
· Rutina semanal estructurada por día y comparación automática planeado vs real.
· Gráficos de progreso por ejercicio.
· Records / PRs, plantillas, timer de descanso.
· Gamificación.
· Compartir con otra persona / multiusuario completo.

Post-V1 — V2 (rama v2-postre, 2026-06-24):
· [x] Rutinas personalizadas con sub-días: Routine → RoutineDay → ejercicios ordenados.
· [x] Timer de descanso por ejercicio: Exercise.restSeconds, timer SVG en RegisterScreen.
· [x] Gráficos de progreso: SVG sin dependencias, 3 métricas (Top set / Volumen / 1RM est.).
· [x] PRs auto-detectados + toast de celebración: peso máximo y 1RM Epley en POST /sets.
· [x] Logros: 10 logros estáticos evaluados server-side, desbloqueados al cargar series.


══════════════════════════════════════════════════════════════════════════════
5. STACK (CON QUÉ ESTÁ HECHA)
══════════════════════════════════════════════════════════════════════════════

Frontend (carpeta web/, en marcha):
· React 19 con Vite (herramienta de desarrollo rápida).
· Tailwind CSS v4 (plugin @tailwindcss/vite, tokens de diseño centralizados en @theme),
  mobile-first.
· URL de la API por env (VITE_API_URL, default http://localhost:4000).

Backend (ya en marcha, carpeta api/):
· Node.js (v24) + TypeScript.
· Express 5 como framework del servidor HTTP.
· tsx para correr TypeScript en desarrollo sin compilar a mano (script "dev": tsx watch).
· Módulos ESM ("type": "module" en package.json).

Base de datos:
· Prisma como ORM (el traductor entre el código y la base). Versión fijada en 6.x —
  IMPORTANTE: no subir a Prisma 7, que cambia el formato (config nuevo y cliente en otra
  carpeta) y rompe esta configuración.
· En desarrollo: SQLite, un solo archivo local (dev.db). Cero configuración de nube.
· En producción (al desplegar): se cambia a PostgreSQL en Supabase. Prisma hace ese cambio
  casi con una sola línea.

Infraestructura / herramientas:
· Git + GitHub para versionar el código.
· Render para desplegar el backend y el frontend cuando llegue el momento.
· Editor: VS Code. Terminal: PowerShell en Windows.

Convención de respuestas de la API: todas devuelven un "envelope" uniforme,
{ "success": true, "data": ... } cuando sale bien.


══════════════════════════════════════════════════════════════════════════════
6. MODELO DE DATOS (LAS TABLAS)
══════════════════════════════════════════════════════════════════════════════

Definido en api/prisma/schema.prisma.

Exercise (un ejercicio)
· id          — identificador único (cuid, generado solo)
· name        — nombre del ejercicio
· target      — objetivo en texto, opcional (ej. "4x8-10 RIR2")
· muscleGroup — grupo muscular para agrupar en secciones (String?, validado en backend).
· restSeconds — segundos de descanso objetivo para el timer; null = sin preferencia. [V2]
· createdAt   — fecha de creación
· sets        — relación: series hechas
· routineItems — relación: apariciones en días de rutina [V2]

WorkoutSet (una serie concreta hecha)
· id         — identificador único
· exerciseId — a qué ejercicio pertenece
· date       — cuándo se hizo
· weight     — peso (número con decimales)
· reps       — repeticiones (entero)
· rir        — RIR, opcional (entero)
· createdAt  — fecha de creación

User (para el login)
· id           — identificador único (cuid)
· username     — usuario, único
· passwordHash — contraseña hasheada con bcrypt
· createdAt    — fecha de creación

Routine (rutina personalizada) [V2]
· id, name, userId, order, createdAt
· days — lista de RoutineDay (ordenados por order)

RoutineDay (día dentro de una rutina) [V2]
· id, name, routineId, order
· exercises — lista de RoutineDayExercise (ordenados por order)

RoutineDayExercise (ejercicio asignado a un día de rutina) [V2]
· id, routineDayId, exerciseId, order
· exercise — Exercise embebido (include del backend)

UserAchievement (logro desbloqueado) [V2]
· id, userId, key (clave del logro estático en achievements.ts), unlockedAt
· @@unique([userId, key]) — no se pueden duplicar logros

Regla: cascades transitivos — borrar User elimina todo lo suyo. Aislamiento estricto por
userId en todos los endpoints.


══════════════════════════════════════════════════════════════════════════════
7. API (ENDPOINTS)
══════════════════════════════════════════════════════════════════════════════

Ya implementados (probados de punta a punta):
· GET    /health               — chequeo de que el server está vivo
· GET    /exercises            — lista todos los ejercicios (más nuevo primero)
· POST   /exercises            — crea un ejercicio { name, target?, muscleGroup, restSeconds? }
· PATCH  /exercises/:id        — edita nombre, objetivo, grupo o restSeconds de un ejercicio
· DELETE /exercises/:id        — borra un ejercicio (y sus series, por cascade)
· POST   /sets                 — registra una serie; devuelve { set, prs, achievements } [V2]
· GET    /exercises/:id/last   — devuelve la última sesión de un ejercicio
· GET    /exercises/:id/sets   — historial de series de un ejercicio

Login (tabla User + bcrypt + JWT, sin refresh tokens):
· POST   /auth/register        — crea usuario { username, password } y devuelve { token }
· POST   /auth/login           — valida { username, password } y devuelve { token }

Rutinas [V2]:
· GET    /routines             — tus rutinas con días y ejercicios anidados
· POST   /routines             — crea rutina { name }
· PATCH  /routines/:id         — renombra/reordena { name?, order? }
· DELETE /routines/:id         — borra rutina (cascade)
· POST   /routines/:id/days    — agrega día { name }
· PATCH  /routine-days/:dayId  — renombra/reordena día
· DELETE /routine-days/:dayId  — borra día
· POST   /routine-days/:dayId/exercises    — agrega ejercicio al día { exerciseId }
· PATCH  /routine-day-exercises/:itemId    — reordena item { order }
· DELETE /routine-day-exercises/:itemId    — quita ejercicio del día

Logros [V2]:
· GET    /achievements         — todas las defs + estado desbloqueado del usuario

Todos validan el input externo y devuelven el envelope { success, data } (o
{ success: false, error } con el status correcto, vía handler de error central).


══════════════════════════════════════════════════════════════════════════════
8. ESTRUCTURA DE CARPETAS
══════════════════════════════════════════════════════════════════════════════

gymlog/
└── api/                      backend
    ├── prisma/
    │   ├── schema.prisma     definición de las tablas
    │   └── dev.db            la base SQLite local (se crea sola con db push)
    ├── src/
    │   ├── server.ts         arma Express, cors, json, monta las rutas
    │   ├── db.ts             la conexión a Prisma (export const prisma)
    │   └── exercises.ts      router con los endpoints de ejercicios
    ├── .env                  DATABASE_URL="file:./dev.db"
    ├── package.json          dependencias y el script "dev"
    └── tsconfig.json         config de TypeScript

(La carpeta del frontend, web/, se crea en los próximos pasos.)


══════════════════════════════════════════════════════════════════════════════
9. CÓMO CORRERLO EN LOCAL
══════════════════════════════════════════════════════════════════════════════

Requisitos: Node instalado. En PowerShell, una sola vez, permitir scripts:
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

Backend (dentro de api/):
· Instalar dependencias (solo la primera vez):  npm install
· Crear/actualizar la base a partir del schema:  npx prisma db push
· Levantar el server:                            npm run dev   (queda en http://localhost:4000)
· Ver la base con interfaz visual (opcional):    npx prisma studio

Importante: usar DOS terminales. Una corre el server (npm run dev) y queda ocupada; la otra
para comandos sueltos (probar endpoints, prisma, etc.). Los comandos de herramientas como
Prisma van con npx (no npm).


══════════════════════════════════════════════════════════════════════════════
10. ESTADO ACTUAL Y ROADMAP
══════════════════════════════════════════════════════════════════════════════

Hecho:
· [x] Backend corriendo (Express + TypeScript, ruta /health).
· [x] Base de datos y tablas (Prisma + SQLite, Exercise y WorkoutSet).
· [x] Endpoints de ejercicios: crear, listar, editar (PATCH) y borrar (DELETE) — probados.
· [x] Endpoints de series y "última vez" (POST /sets, /last, /sets historial) — probados.
· [x] Validación de input + handler de error central con envelope { success, error }.
· [x] Frontend: scaffold (Vite + React + TS + Tailwind v4, mobile-first, tokens centralizados).
· [x] Frontend: pantalla de ejercicios (lista, agregar, editar objetivo, borrar) con 4 estados.
· [x] Frontend: pantalla de registrar hoy (elegir ejercicio, ver objetivo + última vez,
      cargar series rápido con prefill inteligente y alta optimista) con 4 estados.
· [x] Rediseño visual (header fijo, tarjetas, fuente Inter, iconos SVG, más aire).
· [x] Grupo muscular por ejercicio: select obligatorio al crear y ejercicios agrupados en
      secciones por grupo (1 columna en celular, 2 en pantalla ancha).
· [x] Login (tabla User + bcrypt + JWT): register/login, rutas /exercises y /sets protegidas,
      frontend con pantalla de login, token persistido, logout y vuelta al login ante un 401.
· [x] Datos separados por usuario (Exercise.userId; todos los endpoints filtran por el token).
· [x] Rediseño visual V2 (UI generada con Stitch y portada al stack): login con tabs, cards con
      hover, modales, RIR en acento, grilla por grupo muscular. Grupo "antebrazo" agregado.
· [x] Deploy: backend y frontend en Render, base en Supabase/Postgres. Verificado de punta a
      punta desde el celu (2026-06-23). UptimeRobot mantiene la API despierta.

· [x] V2 — Rutinas personalizadas con sub-días (Routine / RoutineDay / RoutineDayExercise).
· [x] V2 — Timer de descanso SVG (Exercise.restSeconds, arranca al cargar serie).
· [x] V2 — Gráficos de progreso SVG (Top set / Volumen / 1RM estimado por día, en ProgressScreen).
· [x] V2 — PRs auto-detectados: peso máximo y 1RM Epley, toast de celebración en RegisterScreen.
· [x] V2 — Logros: 10 logros estáticos evaluados en POST /sets, pantalla AchievementsScreen.
· [x] V2 — Navegación de 4 tabs (Ejercicios / Rutinas / Progreso / Logros), bottom-nav mobile.

V2 COMPLETO (rama v2-postre, 2026-06-24). Pendiente: merge a main + deploy manual en Render.


══════════════════════════════════════════════════════════════════════════════
11. DECISIONES Y NOTAS IMPORTANTES
══════════════════════════════════════════════════════════════════════════════

· Prisma fijado en 6.x. La 7 cambió la config (archivo prisma.config.ts) y genera el cliente
  en una carpeta custom (src/generated/prisma), lo que rompe el import estándar desde
  @prisma/client. Si alguna vez aparece ese problema: borrar prisma.config.ts y src/generated,
  dejar el generador como provider = "prisma-client-js" sin "output", y correr prisma db push.
· SQLite en desarrollo por simplicidad; PostgreSQL en producción. El cambio es casi una línea
  en el datasource del schema.
· Windows: PowerShell bloquea scripts por defecto; se habilita con Set-ExecutionPolicy
  (CurrentUser, RemoteSigned). El comando npm es un script, por eso fallaba antes.
· El cliente de Prisma hay que generarlo (prisma generate, que db push corre solo); si el
  server dice "@prisma/client did not initialize yet", es eso.
· Usar dos terminales (una para el server, otra para comandos) y npx para herramientas.
· El puerto del backend se lee de la variable de entorno PORT (default 4000). En local queda
  en 4000; en producción (Render) la plataforma lo inyecta. Útil además para correr en otro
  puerto si el 4000 está ocupado: en PowerShell, $env:PORT='4100'; npm run dev.
· Manejo de errores centralizado: los handlers validan y tiran HttpError (src/http.ts); un
  middleware de error en server.ts arma { success: false, error } con el status. Express 5
  propaga el rechazo de las promesas async hasta ese middleware.
· Frontend sin router: con dos pantallas (lista de ejercicios / registrar hoy) alcanza un
  estado de vista en App.tsx; un router sería sobre-ingeniería para el tamaño de la app.
· "Última vez" y "series de hoy" se calculan en el cliente agrupando el historial
  (GET /exercises/:id/sets) por día LOCAL, no UTC: entrenar es un evento local y agrupar por
  UTC partiría una sesión nocturna en dos días. La referencia a superar es el día previo más
  reciente; el alta de series es optimista con rollback si el POST falla.
· Grupo muscular: lista fija de 8 (espalda, hombro, pecho, piernas, triceps, biceps, antebrazo,
  trapecio) validada en el backend; se guarda como String? (no enum, porque SQLite no los soporta
  en Prisma) y nullable para no romper ejercicios ya cargados (caen en la sección "Otros"). La
  fuente de verdad de las claves/labels del frontend está en web/src/muscleGroups.ts. Al sumar un
  grupo hay que tocar dos lugares: MUSCLE_GROUPS en api/src/exercises.ts y en web/src/muscleGroups.ts
  (no hace falta db push porque el campo es String?).
· "Columnas separadas" por grupo: en celular las secciones van apiladas (mobile-first; columnas
  lado a lado no entran en ancho de teléfono) y a md+ pasan a 2-3 columnas ensanchando solo la
  vista de lista. El registro queda siempre angosto para enfocar una cosa a la vez.
· Rediseño visual (UI generada con Google Stitch y portada a mano al stack): se mantuvieron los
  tokens centralizados en web/src/index.css (se sumó --color-accent #e47014 para el RIR y
  --color-surface-lowest para pills/inputs hundidos). Solo presentación: no se tocó la lógica ni
  los endpoints. Se descartaron del output de Stitch las features fuera de alcance (bottom-nav,
  pantalla "Progreso", ajustes) por no estar en el V1. Iconos siguen siendo SVG inline (Lucide),
  no se sumó la fuente de iconos de Material que traía el export. El alta/edición de ejercicios
  pasó a un Modal (web/src/components/ui.tsx) y el selector de grupo muscular a una grilla de
  pills (radio) para tocar de un toque en el celu.
· Login: tabla User + bcrypt (hash de password) + JWT (sin refresh tokens). El middleware
  requireAuth protege /exercises y /sets; un 401 en el frontend limpia el token y vuelve al
  login. Las variables van en api/.env: JWT_SECRET (firma del token) y se cargan con dotenv.
  En dev hay un secreto de fallback; en producción (Render) JWT_SECRET es obligatorio.
· Datos separados por usuario: Exercise tiene userId (relación con User, onDelete Cascade) y
  TODOS los endpoints filtran por el usuario del token (requireAuth deja req.userId; los
  handlers usan getUserId()). Pedir un ejercicio ajeno devuelve 404 (no se filtra que existe).
  WorkoutSet no tiene userId propio: su dueño es el del ejercicio (POST /sets valida que el
  ejercicio sea tuyo). Antes esto era single-user (datos compartidos); se cambió a multiusuario
  real a pedido para que cada cuenta tenga su propio registro.
· [V2] Rutinas con sub-días: Routine → RoutineDay → RoutineDayExercise. El aislamiento es
  transitivo: RoutineDay se verifica comprobando que su rutina sea del usuario (join); igual
  RoutineDayExercise. Ordenamiento manual con campo order (entero); reordenar = PATCH en orden,
  sin drag&drop (mobile-first con botones ↑/↓).
· [V2] Timer de descanso: Exercise.restSeconds (Int?) guarda el objetivo de descanso del
  ejercicio. Al cargar una serie exitosa en RegisterScreen, el timer RestTimer arranca solo con
  ese valor. Timer SVG (anillo de progreso) sin dependencias externas, con controles grandes
  (play/pausa, reset, ±15s, presets).
· [V2] PRs auto-detectados en POST /sets: antes de insertar la serie se calculan maxWeight y
  best1RM (Epley: weight*(1+reps/30)) del historial previo; tras insertar se comparan y se
  devuelve { set, prs: { weightPR, oneRmPR }, achievements }. El frontend muestra un toast.
· [V2] Logros: definiciones estáticas en api/src/achievements.ts (10 logros: first-workout,
  workouts-N, streak-N, volume-Nk, first-pr). Motor evaluate(stats) server-side. POST /sets
  desbloquea logros nuevos y los devuelve en el payload. GET /achievements devuelve todas las
  defs + estado desbloqueado. AchievementsScreen muestra grilla con tarjetas desbloqueadas
  (realzadas) y bloqueadas (atenuadas con candado).
· [V2] Navegación de 4 tabs sin router (mismo patrón que V1): estado tab + subView en App.tsx.
  NavBar (bottom en mobile, top en desktop), icono+label, activo en text-brand. Registro sigue
  siendo sub-vista que se abre al tocar ejercicio (desde Ejercicios o desde un día de rutina).
· [V2] Gráficos de progreso: ProgressChart SVG sin librerías externas. Agrupa series por día
  local (reutiliza localDayKey de useRegister). 3 métricas: Top set (peso máximo del día),
  Volumen (Σ weight×reps), 1RM estimado (máximo del día). ProgressScreen: selector de
  ejercicio con búsqueda + detalle con PR cards + toggle de métrica + gráfico.


══════════════════════════════════════════════════════════════════════════════
12. DEPLOY (PRODUCCIÓN: SUPABASE + RENDER)
══════════════════════════════════════════════════════════════════════════════

Objetivo: backend y frontend en Render, base Postgres en Supabase. Variables sensibles por
entorno (nunca en el código). Pasos:

A) Base de datos (Supabase)
   1. Crear proyecto en supabase.com. Guardar la contraseña de la base.
   2. Project Settings → Database → Connection string → URI. Copiar la URL (postgresql://...).
   3. En api/prisma/schema.prisma cambiar el datasource:  provider = "postgresql"
      (en dev queda "sqlite"; es la única línea que cambia entre dev y prod).
   4. Con DATABASE_URL apuntando a Supabase:  npx prisma db push   (crea las tablas).

B) Backend (Render → Web Service, raíz: api/)
   - Build command:  npm install --include=dev && npx prisma generate
   - Start command:  npx prisma db push && npx tsx src/server.ts
     (--include=dev porque tsx/prisma son devDependencies y Render setea NODE_ENV=production,
      que por defecto las saltearía.)
   - Variables de entorno:
       DATABASE_URL  = (Supabase, pooler puerto 6543, con ?pgbouncer=true) — runtime de la app
       DIRECT_URL    = (Supabase, conexión directa puerto 5432) — la usa db push en el build
       JWT_SECRET    = (valor largo y aleatorio, distinto al de dev)
       CORS_ORIGIN   = (la URL pública del frontend, ej. https://gymlog-web.onrender.com)
     PORT lo inyecta Render solo.

C) Frontend (Render → Static Site, raíz: web/)
   - Build command:    npm install && npm run build
   - Publish directory: dist
   - Variable de entorno:
       VITE_API_URL = (la URL pública del backend, ej. https://gymlog-api.onrender.com)
     (Vite la incrusta en el build; si cambia, hay que volver a buildear.)

D) Orden y verificación
   - Primero el backend (para tener su URL) → setear VITE_API_URL en el front → buildear front
     → setear CORS_ORIGIN en el back con la URL del front. Probar registro/login y registrar
     una serie desde el celular contra producción.

Nota: ya está preparado en el código — CORS lee CORS_ORIGIN, el puerto lee PORT, los secretos
salen de .env (ver api/.env.example). Falta solo crear las cuentas y pegar las credenciales.
