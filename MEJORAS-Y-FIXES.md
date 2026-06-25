GYMLOG — ANÁLISIS, FIXES Y MEJORAS

Documento para que un agente arme un plan y lo ejecute. Sale de una revisión del backend
completo (auth, exercises, sets, routines, achievements, schema) hecha en junio 2026.

Contexto rápido: app personal y mobile-first para registrar series/pesos/reps/RIR en el gym y
comparar lo hecho contra lo planeado. Stack: React+Vite+Tailwind (web), Express+TS+Prisma (api),
Postgres en Supabase (prod), deploy en Render. La fuente de verdad de comportamiento es
CLAUDE.md (estructura liviana, TypeScript sin `any` sin justificar, envelope { success, data },
mobile-first, núcleo antes que postre). Zona horaria del usuario: Uruguay (America/Montevideo,
UTC-3, SIN horario de verano).

Cómo trabajar este documento (instrucción para el agente):
1. Leé CLAUDE.md y el README/doc maestro antes de tocar nada.
2. Armá un plan paso a paso (qué archivos tocás, en qué orden, con criterio de aceptación).
3. Mostrá el plan y esperá OK antes de ejecutar.
4. Ejecutá de a un bloque y verificá cada uno (probar de verdad, no asumir).
5. Respetá el alcance: los BLOQUEANTES y los FIXES van ahora; el POSTRE NO se implementa sin
   aprobación explícita.


══════════════════════════════════════════════════════════════════════════════
VEREDICTO DE LA REVISIÓN
══════════════════════════════════════════════════════════════════════════════

La app está apta para uso continuo de 3 personas una vez resueltos los bloqueantes de abajo.
Lo más importante ya está bien: la separación de datos por usuario es correcta en todos los
endpoints (auth con bcrypt, requireAuth deja userId en la request, y exercises/sets/routines/
achievements filtran por dueño, con chequeo de propiedad transitivo en rutinas y verificación de
que un ejercicio sea del usuario antes de asociarlo). No hay fugas de datos entre usuarios.
Calidad general buena: sin `any` tramposo, validación de input con funciones parse, envelope
uniforme, @@unique en logros para evitar duplicados. El objetivo de este documento es cerrar la
brecha entre "funciona en mi máquina" y "lo usan 3 personas todos los días sin sorpresas".


══════════════════════════════════════════════════════════════════════════════
1. BLOQUEANTES (verificar / cerrar antes de compartir la app)
══════════════════════════════════════════════════════════════════════════════

1.1 — Base en Postgres (Supabase), no SQLite.
Estado: el schema ya está en `provider = "postgresql"` con `url` (DATABASE_URL) y
`directUrl` (DIRECT_URL). Las dos URLs y CORS_ORIGIN YA están cargadas en Render (confirmado por
el dueño). Falta verificar:
  - Que se haya corrido `npx prisma db push` contra Supabase (usando DIRECT_URL, puerto 5432) y
    que las tablas existan realmente en la base de prod (revisar en el editor de tablas de
    Supabase o con prisma studio apuntando a prod).
  - Que la app en Render conecte y responda (probar /health y un login real).
Criterio de aceptación: registrarse y cargar datos en la app desplegada, cerrar y volver a
entrar, y que los datos sigan ahí (que NO se borren en un redeploy).

1.2 — JWT_SECRET real en Render.
Riesgo: si no está seteado, el código cae al secreto de desarrollo hardcodeado
('dev-gymlog-secret-cambialo-en-produccion') y cualquiera podría falsificar tokens.
Acción: verificar que en Render exista la env var JWT_SECRET con un valor largo y aleatorio
(ej. `openssl rand -base64 32`), distinto del de dev.
Criterio de aceptación: un token firmado con el secreto viejo de dev es rechazado en prod.

1.3 — CORS_ORIGIN correcto.
Estado: ya está cargada en Render. Verificar que el valor sea EXACTAMENTE la URL del frontend
desplegado (mismo esquema https, sin barra final), y que se pueda usar la app desde el navegador
sin errores de CORS en la consola.


══════════════════════════════════════════════════════════════════════════════
2. FIXES (arreglar pronto — no rompen, pero molestan con uso diario)
══════════════════════════════════════════════════════════════════════════════

2.1 — Zona horaria: usar America/Montevideo (UTC-3), no la hora del servidor.
Problema: el cálculo del "día" usa la hora local del servidor. Render corre en UTC, el usuario
está en Uruguay (UTC-3). Una serie cargada de noche (ej. 22:00 en Uruguay = 01:00 UTC del día
siguiente) cae en el día equivocado. Esto corrompe: la agrupación de "última sesión", la racha
y los días entrenados de los logros.
Archivos afectados:
  - api/src/achievements.ts → funciones localDayKeyServer() y computeStreak() (y computeStats()
    que las usa).
  - api/src/exercises.ts → endpoint GET /exercises/:id/last (cálculo de dayStart/dayEnd).
Solución sugerida: crear un helper único, p. ej. api/src/time.ts, que calcule la "clave de día"
(YYYY-MM-DD) y los límites de día SIEMPRE en la zona America/Montevideo, sin importar la zona del
servidor (usar Intl.DateTimeFormat con timeZone: 'America/Montevideo' para derivar el año/mes/día
local). Reemplazar los cálculos de día en los dos archivos por ese helper. Nota: Uruguay es
UTC-3 todo el año (no tiene horario de verano), así que un offset fijo de -3 también es válido y
más simple, pero usar la zona IANA es más robusto si algún día se suma otra zona.
Criterio de aceptación: una serie creada a las 23:00 hora de Uruguay cuenta como ese día (no el
siguiente) en "última sesión", racha y días entrenados. Probar cerca de medianoche.

2.2 — Poder borrar (y editar) una serie ya cargada.
Problema: api/src/sets.ts solo tiene POST. Si alguien se equivoca de peso/reps/RIR, la serie
queda mal para siempre. Para uso diario es casi obligatorio poder corregir.
Solución sugerida:
  - Backend: agregar DELETE /sets/:id y, opcional, PATCH /sets/:id (editar weight/reps/rir).
    Chequear propiedad transitiva: la serie pertenece al usuario vía set → exercise → userId
    (findFirst where { id, exercise: { userId } }). 404 si no es suya.
  - Frontend: en la vista de la sesión, un botón para borrar una serie (y opcional editar).
  - Decisión a tomar: al borrar una serie NO hace falta revocar logros ya ganados (mantenerlos
    es más simple y amable). Documentarlo como decisión.
Criterio de aceptación: el dueño puede borrar/corregir una serie suya; no puede tocar la de otro
usuario (404).

2.3 — (Opcional, decisión del dueño) Registro abierto.
Hoy cualquiera con el link puede crear cuenta (POST /auth/register sin restricción). Para 3
amigos puede estar bien, pero la app queda abierta a internet.
Opciones: (a) dejarlo abierto; (b) exigir un código de invitación compartido vía env
(SIGNUP_CODE): register valida body.code === process.env.SIGNUP_CODE; (c) desactivar el registro
una vez que los 3 estén dados de alta.
Recomendación: si no querés desconocidos, la (b) es simple y suficiente. Es una decisión, no un
bug; que el dueño elija antes de implementar.


══════════════════════════════════════════════════════════════════════════════
3. MENORES / HIGIENE (cuando haya tiempo)
══════════════════════════════════════════════════════════════════════════════

3.1 — Rate limiting en /auth/login y /auth/register (frenar fuerza bruta). Riesgo bajo con 3
usuarios, pero la API está expuesta a internet. Un limitador simple por IP alcanza.
3.2 — Revisar comentarios desactualizados en el schema (mencionan "SQLite no soporta enums"
ahora que el provider es postgresql). Cosmético.
3.3 — Recalcular stats de logros: hoy computeStats() lee TODAS las series del usuario en cada
POST de serie. Con poco volumen está perfecto; solo tenerlo en el radar si crece mucho.


══════════════════════════════════════════════════════════════════════════════
4. POSTRE / PLAN A FUTURO (NO implementar sin aprobación)
══════════════════════════════════════════════════════════════════════════════

· Comparación automática planeado vs real (la idea original): ya existen las dos piezas (la
  rutina como plan y las series como lo hecho), pero no hay algo que las cruce y muestre "hoy
  tocaba esto, hiciste esto". Confirmar si la pantalla existe en el frontend; si no, es el
  próximo gran paso de producto.
· Carga de una serie con fecha pasada (registrar un entreno olvidado / editar la fecha).
· Seguimiento de peso corporal.
· Notas por ejercicio.
· Exportar los datos (CSV/JSON).
· [LA FEATURE MÁS VALORADA POR EL DUEÑO, pero va ÚLTIMA — hacerla cuando todo lo demás esté
  implementado y la app estable] Volverla instalable en el celu (PWA). La app se usa en el gym
  desde el teléfono, así que sentirse una app nativa es el mayor valor para el dueño. Va al
  final a propósito: una PWA NO es una foto congelada, es un envoltorio de la web en vivo, así
  que cualquier feature agregada antes aparece sola en la app instalada; no se pierde nada por
  hacerla última, y queda más prolija sobre una app ya terminada. Alcance: agregar
  manifest.webmanifest (nombre, íconos, theme/background color, display: standalone, start_url),
  un service worker que cachee el shell para que abra rápido y aguante señal mala, el meta
  viewport correcto, e íconos (192 y 512 px). Resultado esperado: poder hacer "Agregar a
  pantalla de inicio" en el celu y que abra a pantalla completa, con ícono propio, como una app.
  Aclaración: es web instalable (gratis, sin cuentas de tienda), NO una app de App Store/Play Store.
· Recordatorios / notificaciones.


══════════════════════════════════════════════════════════════════════════════
5. ORDEN SUGERIDO DE EJECUCIÓN
══════════════════════════════════════════════════════════════════════════════

1. Verificar bloqueantes (1.1 db push en Postgres, 1.2 JWT_SECRET, 1.3 CORS) y dejar la app
   andando en prod con un smoke test: registrar 2 cuentas distintas, confirmar que cada una ve
   solo sus datos, cargar series, y revisar última sesión + racha.
2. Fix 2.1 (zona horaria) — es el bug más sutil y afecta datos que ya se van a empezar a generar.
3. Fix 2.2 (borrar/editar serie).
4. Decisión 2.3 (registro) según lo que elija el dueño.
5. Menores (sección 3) si hay tiempo.
6. Postre: solo con aprobación explícita, de a una feature.
7. ÚLTIMO de todo: la PWA (instalable en el celu). Es la feature más valorada por el dueño, pero
   va al final, sobre la app ya terminada y estable (una PWA refleja la web en vivo, no se pierde
   nada por dejarla para el final).
