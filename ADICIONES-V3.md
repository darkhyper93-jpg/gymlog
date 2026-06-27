GYMLOG — ADICIONES V3 (spec para planificar y ejecutar)

Documento meticuloso de seis adiciones pedidas por el dueño tras usar la app. Pensado para que
un agente Opus arme un plan paso a paso (cada archivo, orden, dependencias, criterio de
aceptación) y un agente Sonnet lo ejecute siguiéndolo sin adivinar.

Reglas (de CLAUDE.md, respetarlas): estructura liviana, TypeScript sin `any` sin justificar,
envelope { success, data }, mobile-first, Prisma fijo en 6, borrar código muerto. Zona horaria
del usuario: America/Montevideo (UTC-3, sin DST) — usar el helper api/src/time.ts.

Orden sugerido de implementación: 4 (arrastrar días) y 1 (timer global) primero porque son base;
después 2 (descansos), 3 (sesión de hoy), 5 (macros). Hacer commit después de CADA feature.


══════════════════════════════════════════════════════════════════════════════
1. CRONÓMETRO GLOBAL Y PERSISTENTE (con aviso al terminar)
══════════════════════════════════════════════════════════════════════════════

PROBLEMA: hoy el timer vive en el estado de RegisterScreen, así que al salir de esa pantalla se
pierde y se reinicia.

LO QUE ES FACTIBLE (implementar esto):
- Timer GLOBAL: sacarlo del estado de RegisterScreen y subirlo a un contexto/proveedor a nivel
  App (un RestTimerProvider en App.tsx que envuelva toda la app). El componente visual RestTimer
  se renderiza una sola vez a nivel App (sigue siendo fixed), así se ve y sigue corriendo en
  CUALQUIER pantalla. RegisterScreen deja de tener estado de timer local: "Agregar serie" llama a
  timer.start(segundos) del contexto.
- PERSISTENTE Y PRECISO EN SEGUNDO PLANO: el timer NO debe decrementar un contador (eso se
  congela cuando el celu va a segundo plano). Debe guardar la hora de fin (endsAt = Date.now() +
  segundos*1000) y calcular `remaining = Math.max(0, endsAt - Date.now())` en cada tick y en el
  evento `visibilitychange`. Así, al volver de segundo plano, muestra el tiempo correcto (o
  "terminado" si ya pasó). Persistir el estado del timer (endsAt, total, running, paused) en
  localStorage para que sobreviva incluso a un reload; al montar, si hay un timer guardado no
  vencido, lo reanuda solo.
- AVISO AL TERMINAR (best-effort): cuando remaining llega a 0, vibrar (navigator.vibrate) y
  mostrar una notificación vía el service worker (registration.showNotification con título tipo
  "¡Descanso terminado! 💪"). Reusar el SW existente (web/src/sw.ts). Disparar la notificación
  desde el cliente al detectar el 0; como respaldo cuando la pantalla está apagada, programar la
  notificación con un setTimeout registrado lo antes posible (best-effort, puede fallar si el SO
  mató la pestaña).
- Solo se reinicia/pierde si el usuario lo CANCELA (botón cerrar) — caso contrario sigue.

LO QUE NO ES POSIBLE EN UNA PWA (NO intentarlo, NO prometerlo):
- Una notificación con cuenta regresiva en vivo (00:25 → 00:24…) como el reloj nativo de Android.
  Las notificaciones web no se actualizan segundo a segundo de forma confiable.
- Garantizar el aviso con la app CERRADA o el celu APAGADO, en especial en iOS. El JS no corre en
  ese estado. El aviso es confiable con la app abierta o en segundo plano con pantalla encendida;
  fuera de eso es best-effort.
- Si el dueño quiere de verdad cuenta regresiva nativa en la barra de notificaciones con pantalla
  apagada, eso requiere una app nativa (no entra en este stack). Dejar constancia y no implementar.

ARCHIVOS: nuevo web/src/timer/RestTimerContext.tsx (estado + lógica timestamp + persistencia +
notificación); web/src/App.tsx (envolver con el provider y renderizar <RestTimer/> a nivel app);
web/src/components/RestTimer.tsx (leer del contexto en vez de props locales; conservar mover/
reset-posición/presets/±15s/pausar/cerrar ya existentes); web/src/components/RegisterScreen.tsx
(quitar el estado timerSecs local y llamar al contexto al agregar serie).

CRITERIO DE ACEPTACIÓN: iniciar un descanso, navegar a otra pantalla y volver → el timer sigue
con el tiempo correcto; mandar el celu a segundo plano 30s y volver → muestra el tiempo correcto
(no se atrasó); al llegar a 0 vibra y aparece notificación; recargar la página con un timer activo
→ se reanuda; cancelar → desaparece.


══════════════════════════════════════════════════════════════════════════════
2. DESCANSO ENTRE EJERCICIOS + MARCAR "ÚLTIMA SERIE"
══════════════════════════════════════════════════════════════════════════════

OBJETIVO: distinguir el descanso ENTRE SERIES (el de hoy, ya existe: Exercise.restSeconds) del
descanso ENTRE EJERCICIOS (más largo). Al marcar que una serie es la última del ejercicio, el
timer debe usar el descanso entre ejercicios, no el base del ejercicio.

DECISIÓN DE DISEÑO (V1, sin tabla nueva): el "descanso entre ejercicios" es un valor único
configurable por el usuario, guardado en localStorage (clave p.ej. `rest-between-exercises`,
default 180s). Editable desde un campo en la pantalla de configuración/notificaciones o un lugar
accesible. (Extensión futura opcional: override por ejercicio; NO hacerlo ahora.)

UI: en RegisterScreen, en el formulario de nueva serie (SetForm), agregar un checkbox/toggle
"Última serie de este ejercicio". Al agregar una serie con ese check activado, en lugar de iniciar
el timer con exercise.restSeconds, iniciarlo con el valor "descanso entre ejercicios" de
localStorage. Si el check está apagado, comportamiento actual (restSeconds entre series).

ARCHIVOS: web/src/components/RegisterScreen.tsx (checkbox en SetForm + lógica al elegir qué
duración pasar a timer.start); un pequeño helper/almacenamiento para el valor global (localStorage)
y su input de configuración. Sin cambios de backend ni de base.

CRITERIO DE ACEPTACIÓN: con descanso entre series 90s y entre ejercicios 180s, una serie normal
arranca timer en 90s; una serie marcada "última serie" arranca en 180s. El valor entre ejercicios
se puede editar y persiste.


══════════════════════════════════════════════════════════════════════════════
3. SELECTOR DE "QUÉ ENTRENÁS HOY" (en Rutinas)
══════════════════════════════════════════════════════════════════════════════

OBJETIVO: un botón en la sección Rutinas para elegir explícitamente la sesión de hoy, en vez de
depender solo del match automático por día de la semana. Opciones: el día de hoy de una rutina
(elegir la rutina; si no hay ninguna, que invite a crear una), otro día, o una combinación
(marcar varios días, incluso de la misma rutina).

DECISIÓN DE DISEÑO: la selección se guarda en localStorage con clave por fecha Uruguay (p.ej.
`today-session-2026-06-26` = { routineId, dayIds: string[] }). Si existe una selección para HOY,
esa manda sobre el match por weekday: esos días se tratan como "hoy" (se expanden por defecto,
muestran el progreso planeado-vs-real). Si no hay selección, se mantiene el comportamiento actual
(matchesToday por nombre de día). La selección de un día anterior queda obsoleta sola al cambiar
la fecha.

UI: botón "¿Qué entrenás hoy?" arriba en RoutinesScreen. Abre un modal: lista de rutinas → al
elegir una, lista de sus días con checkboxes (multi-selección permitida = combinación). Botón
"Guardar". Si no hay rutinas, el modal muestra un estado vacío con botón "Crear rutina" (reusar el
flujo create-routine existente). Indicador visible de qué está seleccionado para hoy y opción de
limpiar la selección.

ARCHIVOS: web/src/components/RoutinesScreen.tsx (botón + modal + integración con la lógica isToday
de DaySection: hoy = está en la selección manual, o si no hay selección, matchesToday). Un helper
de localStorage para leer/escribir la selección del día. Sin backend.

CRITERIO DE ACEPTACIÓN: elegir "hoy = día Push de PPL" → ese día aparece expandido y marcado como
hoy aunque el weekday no coincida; elegir una combinación de 2 días → ambos cuentan como hoy; sin
selección → vuelve al match por weekday; al día siguiente la selección vieja ya no aplica.


══════════════════════════════════════════════════════════════════════════════
4. ARRASTRAR LOS DÍAS (no solo los ejercicios)
══════════════════════════════════════════════════════════════════════════════

OBJETIVO: reordenar los DÍAS de una rutina arrastrando, igual que ya se hace con los ejercicios.
Reemplaza los botones subir/bajar de día.

BACKEND: agregar en api/src/routines.ts (routinesRouter) un endpoint
PATCH /routines/:routineId/reorder con body { dayIds: string[] } que valide propiedad
(routine.userId === userId) y que dayIds coincida exactamente con los días de la rutina, y en una
transacción Prisma setee order=índice para cada RoutineDay. Mismo patrón que el reorder de
ejercicios ya existente (PATCH /routine-days/:dayId/reorder).

FRONTEND: web/src/api/routines.ts (agregar reorderDays(routineId, dayIds)); web/src/hooks/
useRoutines.ts (agregar reorderDays con update optimista; BORRAR moveDayUp/moveDayDown si quedan
sin uso); web/src/components/RoutinesScreen.tsx (en RoutineCard envolver la lista sortedDays con
DndContext + SortableContext de @dnd-kit ya instalado; en DaySection sacar el bloque de botones
ChevronUp/ChevronDown de día y poner un drag handle; mantener el chevron de plegar/desplegar y el
resto de acciones). Usar PointerSensor + drag handle para no romper el scroll en celu, igual que
los ejercicios.

CRITERIO DE ACEPTACIÓN: arrastrar un día lo reordena y el orden persiste tras recargar; en celu el
arrastre no rompe el scroll; el reorden de ejercicios dentro del día sigue funcionando.


══════════════════════════════════════════════════════════════════════════════
5. SECCIÓN MACROS + AGUA DIARIA (opcional)
══════════════════════════════════════════════════════════════════════════════

OBJETIVO: una sección nueva "Macros" que pida datos y calcule calorías y macros (proteína, grasa,
carbohidratos) con una fórmula estándar y precisa, y además sugiera el consumo diario de agua
recomendado (en la misma pantalla, con los mismos datos).

DATOS QUE PIDE (todos necesarios para un cálculo preciso): género (masculino/femenino), edad
(años), altura (cm), peso (kg) — prefilear con la última pesada de body-weight si existe —, días
de entrenamiento por semana (0–7), y objetivo (perder grasa / mantener / ganar músculo).

FÓRMULA EXACTA (usar estas, no inventar):
- BMR (Mifflin-St Jeor):
    hombre:  BMR = 10*peso_kg + 6.25*altura_cm − 5*edad + 5
    mujer:   BMR = 10*peso_kg + 6.25*altura_cm − 5*edad − 161
- Factor de actividad según días/semana:
    0 días → 1.2 ; 1–2 → 1.375 ; 3–4 → 1.55 ; 5–6 → 1.725 ; 7 → 1.9
- TDEE = BMR * factor.
- Ajuste por objetivo:
    perder grasa → TDEE * 0.80  (déficit 20%)
    mantener     → TDEE
    ganar músculo→ TDEE * 1.10  (superávit 10%)
  Llamar a ese resultado `kcalObjetivo` (redondear a entero).
- Macros:
    proteína_g = 2.0 * peso_kg
    grasa_g    = 0.9 * peso_kg
    kcal_restantes = kcalObjetivo − (proteína_g*4 + grasa_g*9)
    carbos_g   = max(0, kcal_restantes) / 4
  Redondear gramos a entero. Mostrar kcalObjetivo y los tres macros en gramos (y opcional, su % de
  kcal). Si kcal_restantes sale negativo (raro, peso muy alto + déficit), poner carbos_g=0 y
  aclarar que conviene revisar los datos.
- AGUA DIARIA (usando peso y días de entrenamiento, en la misma pantalla):
    agua_ml_base = 35 * peso_kg          (35 ml por kg de peso, baseline diario)
    agua_ml_entreno = agua_ml_base + 500 (los días que entrena suma 500 ml)
  Mostrar en LITROS (ml / 1000) redondeado a 1 decimal, indicando los dos valores: el base
  ("días de descanso") y el de día de entrenamiento. Ej. 75 kg → base ≈ 2.6 L, entrenando ≈ 3.1 L.

DECISIÓN DE DISEÑO: los datos del perfil se guardan en localStorage (clave `macros-profile`), el
cálculo se hace en el cliente (función pura, fácil de testear). Sin backend (V1). El peso se
prefilea desde la última entrada de body-weight si está disponible. La sección es opcional: si no
hay datos cargados, muestra un formulario para completarlos.

ARCHIVOS: nuevo web/src/components/MacrosScreen.tsx (formulario + resultado de macros y agua), un
módulo puro web/src/lib/macros.ts con la función de cálculo (macros + agua, tipada, sin any),
entrada en el NavBar
(web/src/components/NavBar.tsx) para la nueva sección, y el ruteo en App.tsx. Reusar componentes
ui existentes (NumberField, Card, etc.).

CRITERIO DE ACEPTACIÓN: con género masculino, 25 años, 175 cm, 75 kg, 4 días, mantener →
BMR=1723.75 (10·75 + 6.25·175 − 5·25 + 5), TDEE≈2672 (1723.75·1.55), kcal≈2672,
proteína=150 g, grasa≈68 g (0.9·75=67.5), carbos≈(2672 − 600 − 607.5)/4 ≈ 366 g
(verificar los números con la fórmula; la fórmula es la fuente de verdad), y agua:
base ≈ 2.6 L, día de entrenamiento ≈ 3.1 L. Cambiar a "perder grasa" baja las kcal un 20%
(≈2137). El perfil persiste tras recargar.


══════════════════════════════════════════════════════════════════════════════
NOTA TRANSVERSAL
══════════════════════════════════════════════════════════════════════════════

Todo el drag-and-drop usa @dnd-kit (ya instalado) con PointerSensor + drag handle. No romper el
aislamiento de datos por usuario (todos los endpoints siguen scopeados por userId). Verificar al
final de cada feature: (cd api && npx tsc --noEmit) y (cd web && npx tsc --noEmit && npm run build),
y un commit por feature. Ninguna feature de este documento debe romper las ya existentes (registro,
series, rutinas, logros, push, PWA, export, peso corporal).
