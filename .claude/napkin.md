# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-06-23] DB = prod (Supabase): nunca correr `prisma db push` sin autorización explícita del dueño**
   Do instead: preparar el schema, frenar y pedir OK antes de correr db push o cualquier migración.

2. **[2026-06-23] Render no auto-redeploya tras push**
   Do instead: tras mergear a main, recordarle al dueño que tiene que disparar el deploy a mano (backend Y frontend).

3. **[2026-06-23] Windows: EPERM en `prisma generate` si hay procesos node vivos**
   Do instead: matar todos los procesos node (salvo Vite) y reintentá el generate.

4. **[2026-06-25] En Windows, usar PowerShell para todos los comandos (Bash da ENOENT en paths con C:)**
   Do instead: usar la herramienta PowerShell, no Bash, para `cd`, `npx`, `npm`, `git` en este proyecto.

## Shell & Command Reliability
1. **[2026-06-23] Prisma fijado en 6.x — no subir a 7.x**
   Do instead: verificar que package.json tenga `"prisma": "^6.x"` antes de cualquier install o upgrade. La 7.x rompe config e import del cliente.

2. **[2026-06-23] `npx tsc --noEmit` en api/ para typecheck (no build)**
   Do instead: `cd C:\...\api; npx tsc --noEmit` en PowerShell (salida vacía = sin errores).

## Domain Behavior Guardrails
1. **[2026-06-23] Envelope uniforme: éxito = `ok(res, data)`; error = `throw new HttpError(status, msg)`**
   Do instead: nunca responder con datos crudos; usar siempre ok() y HttpError de api/src/http.ts.

2. **[2026-06-25] Aislamiento WorkoutSet: no tiene userId propio — ownership es transitivo vía exercise**
   Do instead: en DELETE/PATCH /sets/:id usar `findFirst where { id, exercise: { userId } }`.

3. **[2026-06-25] Zona horaria: el servidor (Render) corre en UTC; Uruguay es UTC-3 todo el año**
   Do instead: para cualquier cálculo de "día", usar helpers de api/src/time.ts (localDayKeyMVD, dayBoundsMVD, prevDayKey). Nunca usar date.getDate()/setHours() en el backend.

4. **[2026-06-23] 4 estados obligatorios en cada pantalla: cargando · vacío · error · con datos**
   Do instead: nunca devolver pantalla en blanco; usar StateView/Spinner de ui.tsx.

5. **[2026-06-23] Iconos SVG inline estilo Lucide (viewBox 24, stroke currentColor) — nunca emojis**
   Do instead: agregar al archivo icons.tsx con el componente Base existente.

6. **[2026-06-23] Colores/tipografía SOLO vía tokens de index.css (bg-brand, text-fg, etc.) — nada hardcodeado**
   Do instead: buscar el token apropiado en @theme de web/src/index.css antes de escribir cualquier color.

## User Directives
1. **[2026-06-25] v2-postre mergeada a main — trabajar en main**
   Do instead: la rama activa es main; v2-postre ya no existe como rama separada de trabajo.

2. **[2026-06-25] POSTRE y PWA no se tocan sin aprobación explícita; PWA va ÚLTIMA de todo**
   Do instead: cualquier feature de sección 4 del MEJORAS-Y-FIXES.md requiere OK del dueño. La PWA solo cuando todo lo demás esté terminado y estable.

3. **[2026-06-23] Frenar ante dudas fundamentales; checkpoints por bloque**
   Do instead: al cerrar cada bloque de trabajo, mostrar resumen y pausar antes de abrir el siguiente.
