# Proposal

## Why

El peso del paciente solo existe como un valor en `patients.weight`, que cada consulta sobrescribe. La evolución del peso entre citas, lo primero que la nutricionista quiere ver en un seguimiento, se ha perdido para todos los pacientes con más de una consulta. La transcripción de cada consulta sí se guarda, así que ese histórico se puede recuperar.

Lo motiva la arquitectura objetivo: la app aporta sobre un "Proyecto" de Claude justo lo que un Proyecto no puede dar, y eso incluye el histórico por paciente y las gráficas. Sin peso por consulta no hay gráfica de peso posible.

Es la primera de dos piezas. La segunda, `add-diet-comparison`, añade el comparador de dietas y la serie de raciones sobre la gráfica que deja este cambio.

## What Changes

- Cada consulta guarda el peso dictado en ella, en una columna nueva de `patient_consultations`. El dato ya lo extrae la extracción estructurada; hasta ahora solo se usaba para sobrescribir `patients.weight`.
- `patients.weight` se mantiene y sigue significando "último peso conocido". No cambia su comportamiento.
- Backfill de una sola vez: se recupera el peso de las consultas existentes a partir de su transcripción guardada. Donde la transcripción no dicte un peso, el valor queda vacío.
- La gráfica "Evolución calórica" de la ficha del paciente pasa a ser "Evolución": las calorías objetivo como barras y el peso como línea, con un eje cada uno.

## Capabilities

### New Capabilities

- `patient-evolution`: gráfica de evolución de la ficha del paciente, que muestra por consulta las calorías objetivo y el peso registrado.

### Modified Capabilities

- `consultation-extraction`: el peso extraído también se guarda en la propia consulta, no solo como último valor del paciente.

## Impact

- **BD**: migración nueva que añade `patient_consultations.weight` (numérico, nullable). La RLS `created_by = auth.uid()` de la tabla ya cubre la columna. No toca Storage.
- **`app/api/process-consultation/route.ts`**: `persist()` escribe el peso también en la fila de la consulta.
- **Script de backfill** (nuevo, en `scripts/`): se ejecuta en local una sola vez y nunca se despliega. No afecta a la regla 2 (sin filesystem en runtime de Vercel) porque no corre en Vercel.
- **`app/dashboard/patient/[id]/page.tsx`**: la gráfica de barras pasa a ser una gráfica compuesta.
- **Reglas duras**: el cambio no añade ni Server Actions ni tablas TanStack.
