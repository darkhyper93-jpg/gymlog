# GYMLOG — CLAUDE.md
# Instrucciones de comportamiento para agentes de IA
# Fuente de verdad del proyecto: gymlog-proyecto.md (léelo primero, siempre)
# (Mové este archivo a la raíz de gymlog y renombralo CLAUDE.md)

---

## ROL

Sos el agente de desarrollo de **gymlog**, una app personal y mobile-first para registrar
series, pesos, reps y RIR en el gimnasio y comparar lo hecho contra lo planeado.

**Antes de cualquier tarea:** leé `gymlog-proyecto.md` completo. Contiene el objetivo, el
stack, el modelo de datos, los endpoints, el estado actual y el roadmap. Este archivo solo
define *cómo* comportarte; el *qué* está en el documento maestro.

**Principio rector:** es una app chica y personal. Mantené todo simple y proporcional al
tamaño. No sobre-ingenierices. La disciplina es: núcleo primero, postre después.

---

## REGLAS ANTES DE ESCRIBIR CÓDIGO

1. Verificar en qué punto del **roadmap** está el desarrollo (sección 10 del doc maestro).
2. Confirmar que lo pedido está **dentro del alcance del V1** (sección 4). Si es "postre", no
   implementarlo sin aprobación explícita.
3. Identificar dependencias: qué tiene que existir antes para que esto funcione.
4. Verificar la ruta exacta donde va cada archivo (sección 8, estructura de carpetas).

---

## REGLAS DURANTE LA IMPLEMENTACIÓN

- **TypeScript siempre.** Nunca `any` sin un comentario que lo justifique. Si no sabés el tipo,
  usá `unknown` y validá antes de usar; nunca apagues el chequeo de tipos con `any`.
- **Tipar todo lo que cruza una frontera:** parámetros, retornos de funciones, cuerpos de
  request y respuestas de la API. Nada implícito en las firmas públicas.
- **Validar el input externo.** Todo lo que llega de afuera (body, params, query) se valida
  antes de tocar la base. Para esta app alcanza una validación mínima y explícita; si crece,
  usar Zod.
- **Estructura liviana, NO las 3 capas de un proyecto grande.** Una conexión a Prisma
  (`src/db.ts`) y un archivo de rutas por entidad (`src/<entidad>.ts`). No crear
  controller/service/repository separados salvo que un archivo se vuelva inmanejable.
- **Envelope de respuesta uniforme:** siempre `{ success: true, data }` al salir bien, y un
  error claro al fallar. Nunca devolver datos crudos sin envelope.
- **Manejo de errores:** todo `async` maneja sus errores (Express 5 propaga el rechazo de una
  promesa al handler de error; si hace falta lógica propia, try/catch).
- **Mobile-first, sin excepción.** Todo componente se diseña primero para pantalla de celular:
  botones grandes, pocos toques, carga rápida. El desktop es secundario.
- **Sin `console.log` en el código final.** Se permite temporalmente para debug, pero se borra
  antes de dar una tarea por terminada.

---

## REGLAS DESPUÉS DE ESCRIBIR CÓDIGO

- Verificar que todos los endpoints usan el envelope `{ success, data }`.
- Verificar que todo componente que trae datos tiene sus estados: **cargando · vacío · error ·
  con datos**. Nunca una pantalla en blanco ni un vacío sin explicación.
- Probar el cambio de punta a punta (crear/leer realmente, no asumir).
- Verificar que no quedó ningún `any` sin justificar ni `console.log`.

---

## ORDEN DE IMPLEMENTACIÓN (por feature)

```
1. Modelo de datos: tablas en api/prisma/schema.prisma  (+ npx prisma db push)
2. Backend: endpoints en api/src/<entidad>.ts (montarlos en server.ts)
3. Probar los endpoints (Invoke-RestMethod / navegador) antes de tocar el frontend
4. Frontend: función de API que consume el endpoint
5. Frontend: estado / hook de datos
6. Frontend: componente(s) con los 4 estados, mobile-first
```

---

## LO QUE NUNCA DEBÉS HACER

- ❌ `any` en TypeScript sin justificación con comentario.
- ❌ Subir Prisma a 7.x (rompe la config y el import del cliente). Queda fijado en 6.x.
- ❌ Implementar features "postre" (gráficos, PRs, gamificación, rutina semanal, etc.) antes de
  que el núcleo del V1 funcione y se use.
- ❌ Cambiar el stack (React+Vite+Tailwind / Express+TS / Prisma+SQLite→Postgres) por otra cosa.
- ❌ Inventar las 3 capas de Bract en una app de dos tablas. Mantenerlo liviano.
- ❌ Endpoint sin envelope `{ success, data }`.
- ❌ Componente sin estado de carga; lista vacía sin un "empty state".
- ❌ Romper el mobile-first (diseñar pensando en desktop primero).
- ❌ Colores u otros valores de diseño hardcodeados de forma desprolija; centralizarlos.
- ❌ `console.log` en código que se da por terminado.
- ❌ Implementar algo que no está en `gymlog-proyecto.md` sin actualizar el doc primero.

---

## CUANDO LO PEDIDO NO ESTÁ EN EL DOCUMENTO MAESTRO

Respondé así:

```
"[Feature] no está en el alcance actual (gymlog-proyecto.md).
Para sumarla necesito definir:
1. ¿Es núcleo del V1 o es postre?
2. ¿Qué datos/tablas necesita?
3. ¿Qué endpoints requiere?
¿Actualizamos el documento maestro primero?"
```

---

## CUANDO TOMES UNA DECISIÓN NO TRIVIAL

Documentala con un comentario inline en el código:

```ts
// DECISIÓN: usamos cuid() para los IDs porque son cortos y seguros para URLs.
```

Y si es una decisión de arquitectura o un cambio importante, anotala en la sección 11 del
documento maestro.

---

## CHECKLIST ANTES DE DECLARAR UNA TAREA COMPLETA

```
□ Modelo de datos actualizado y db push corrido (si la tarea tocó tablas)
□ Backend: endpoints con envelope { success, data } correcto
□ Endpoints probados de verdad (no asumidos)
□ Frontend: api/ tipada que consume el endpoint
□ Frontend: estados cargando + vacío + error + con datos
□ Mobile-first respetado (botones grandes, pocos toques)
□ Sin console.log
□ Sin any sin justificación
□ Nombres de archivo consistentes con la estructura del doc maestro
```
