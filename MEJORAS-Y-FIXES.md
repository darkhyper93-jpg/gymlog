GYMLOG — ANÁLISIS, FIXES Y MEJORAS
(Actualizado 2026-06-25 — estado real tras la sesión de implementación)

══════════════════════════════════════════════════════════════════════════════
ESTADO ACTUAL
══════════════════════════════════════════════════════════════════════════════

Todo lo de las secciones 1, 2 y 3 (bloqueantes, fixes y menores) está COMPLETO.
Las 4 features POSTRE aprobadas también están implementadas y pusheadas.
Pendiente acción manual del dueño: redeploy en Render (backend primero).


══════════════════════════════════════════════════════════════════════════════
1. BLOQUEANTES — TODOS RESUELTOS ✓
══════════════════════════════════════════════════════════════════════════════

[x] 1.1 — Base en Postgres/Supabase. db push corrido; tablas confirmadas en prod.
[x] 1.2 — JWT_SECRET real en Render (confirmado por el dueño).
[x] 1.3 — CORS_ORIGIN correcto en Render (confirmado por el dueño).


══════════════════════════════════════════════════════════════════════════════
2. FIXES — TODOS RESUELTOS ✓
══════════════════════════════════════════════════════════════════════════════

[x] 2.1 — Zona horaria: api/src/time.ts con helpers MVD (localDayKeyMVD, dayBoundsMVD,
          prevDayKey). achievements.ts y exercises.ts actualizados.
[x] 2.2 — DELETE /sets/:id y PATCH /sets/:id (con note). UI con botón borrar + edición inline.
[x] 2.3 — Registro abierto: decisión del dueño → dejarlo abierto.


══════════════════════════════════════════════════════════════════════════════
3. MENORES — TODOS RESUELTOS ✓
══════════════════════════════════════════════════════════════════════════════

[x] 3.1 — Rate limiting: express-rate-limit, 20 req/15 min en /auth.
[x] 3.2 — Schema: comentarios SQLite eliminados; grupos core y abdominales agregados.
[x] 3.3 — computeStats: sin cambio (volumen bajo, tenerlo en el radar si crece).


══════════════════════════════════════════════════════════════════════════════
4. POSTRE — ESTADO
══════════════════════════════════════════════════════════════════════════════

[x] Comparación planeado vs real: RoutinesScreen muestra series reales del día vs plan.
    Detección automática del día de hoy (weekday Uruguay), resaltado y counter de series.
[x] Carga con fecha pasada: SetForm acepta date picker (max=hoy); date pasada → T12:00-03:00.
[x] Notas por ejercicio/serie: note String? en WorkoutSet; campo colapsable en SetForm y edición.
[x] Exportar datos CSV: GET /export → CSV con todos los campos, botón en ProgressScreen.
    Fix de seguridad aplicado: CSV formula injection (prefijo ' en celdas con =, +, -, @, etc.).
[x] Seguimiento de peso corporal: modelo BodyWeight; GET/POST/DELETE /body-weight; sección
    colapsable en ProgressScreen con date picker para pesadas pasadas y lista de últimas 10.

[ ] PWA (instalable en el celu) — PENDIENTE. VA ÚLTIMO de todo. Requiere aprobación explícita.
    Alcance cuando llegue el momento: manifest.webmanifest, service worker de shell, íconos
    192/512 px, meta viewport. Sin cuentas de tienda.

[ ] Recordatorios / notificaciones — PENDIENTE. Sin aprobación aún.


══════════════════════════════════════════════════════════════════════════════
5. PENDIENTE DE ACCIÓN MANUAL (dueño)
══════════════════════════════════════════════════════════════════════════════

1. Redeploy backend en Render → corre prisma db push automáticamente → crea columna `note`
   en WorkoutSet y tabla BodyWeight en Supabase.
2. Redeploy frontend en Render → toma todos los commits nuevos.
3. Smoke test de las 4 features POSTRE en prod.
