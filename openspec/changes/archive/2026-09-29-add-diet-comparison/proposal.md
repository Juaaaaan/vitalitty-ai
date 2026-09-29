# Proposal

## Why

Cada consulta guarda una dieta nueva completa, pero la ficha del paciente no dice qué ha cambiado entre una y la siguiente. Para saber si se bajó el hidrato de la cena, si entró el kéfir o por qué, la nutricionista tiene que abrir dos documentos y compararlos de memoria.

Lo motiva directamente la arquitectura objetivo: la comparación de dietas entre citas es una de las cosas que la app aporta sobre un "Proyecto" de Claude y que un Proyecto no puede hacer. También la restringe: el documento markdown es la fuente de verdad, así que todo lo que se compara es una proyección de ese documento, no un pipeline que genere la dieta a partir de JSON. Y no se vuelve a llamar al modelo de generación.

Depende de `add-weight-history`: usa el peso por consulta y amplía la gráfica que ese cambio deja. Debe archivarse después.

## What Changes

- Sección nueva "Comparar dietas" en la ficha del paciente. Se elige una versión N (≥ 2) y se compara con la versión anterior del mismo paciente. Solo se comparan pares consecutivos.
- La comparación muestra:
  - diferencia de calorías objetivo y de peso entre las dos consultas;
  - diferencia de raciones por grupo de alimento (hidrato en comida, hidrato en cena, proteína, lácteos…), tal como las pauta la dieta;
  - alimentos que entran y alimentos que salen;
  - un resumen en lenguaje natural de qué cambió y por qué, basado en los dos documentos y en lo dicho en la consulta N.
- Proyección de raciones por dieta: de cada documento se extraen, una sola vez, las raciones por grupo y se guardan en la consulta.
- Comparación por par: los alimentos que entran y salen y el resumen se calculan una sola vez por par y se guardan en la consulta N.
- La gráfica de evolución suma una vista de raciones por dieta a lo largo del tiempo.
- Rutas nuevas: `POST /api/diet-portions` (rellena las raciones que falten de un paciente) y `POST /api/compare-diets` (devuelve la comparación de la versión N con la anterior).

## Capabilities

### New Capabilities

- `diet-comparison`: comparar una dieta con la versión anterior del mismo paciente. Incluye la diferencia de calorías, peso y raciones, los alimentos que entran y salen, y el resumen de qué cambió y por qué.

### Modified Capabilities

- `patient-evolution` (lo crea `add-weight-history`): se añade la evolución de las raciones por grupo a lo largo de las dietas.

## Impact

- **BD**: migración nueva con dos columnas `jsonb` nullable en `patient_consultations`: `diet_portions` (proyección de raciones de esa dieta) y `diet_changes` (comparación con la versión anterior). La RLS `created_by = auth.uid()` de la tabla ya las protege. No toca Storage: se lee `diet_md` de la fila, no el fichero del bucket `diets`.
- **Rutas**: `app/api/diet-portions/route.ts` y `app/api/compare-diets/route.ts`, nuevas. El cliente las llama con `fetch` (regla 1).
- **Servicios**: uno nuevo de proyección y comparación en `src/services/`, con el cliente compartido `lib/ai/anthropic.ts`.
- **UI**: `app/dashboard/patient/[id]/page.tsx` y un componente nuevo en `src/components/` para la sección de comparación. La tabla de diferencias es una tabla simple, sin TanStack. Si en algún momento se usara TanStack, se aplica la regla 3.
- **Modelo**: llamadas nuevas al modelo de extracción, no al de generación.
- **Reglas duras**: regla 1 (solo route handlers). Regla 2: no hay prompts ni plantillas en ficheros, todo va en constantes TS.
