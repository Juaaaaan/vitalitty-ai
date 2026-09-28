# Tasks

## 1. Peso por consulta

- [x] 1.1 Crear la migración `supabase/migrations/<timestamp>_add_consultation_weight.sql` que añade `patient_consultations.weight numeric` nullable; verificar con `list_tables` (o `\d patient_consultations`) que la columna existe tras aplicarla
- [x] 1.2 Añadir `weight?: number | null` a `ConsultationData` en `src/models/extraction/extraction.models.ts`; verificar con `npx tsc --noEmit`
- [x] 1.3 En `persist()` (`app/api/process-consultation/route.ts`), escribir `extraction.patient.weight` en el insert de la consulta, sin cambiar la actualización de `patients.weight`; verificar con tests nuevos en `app/api/process-consultation/__tests__/route.test.ts`: con peso dictado, la consulta se inserta con `weight: 62`; sin peso, con `weight: null` y sin tocar `patients.weight`; con la extracción fallida, la consulta se guarda sin peso
- [x] 1.4 Ejecutar `npm run lint` y `npx vitest run` y verificar que pasan

## 2. Backfill

- [ ] 2.1 Crear `scripts/backfill-consultation-weight.ts` (D3): lee `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` del entorno, selecciona las filas con `weight is null and audio_transcription is not null`, pide `{ weight: number | null }` (peso actual en kg) y actualiza solo `weight` cuando no es `null`; admite `--dry-run`, que imprime sin escribir; verificar que `node scripts/backfill-consultation-weight.ts --dry-run` lista las consultas y los pesos propuestos sin modificar la BD
- [x] 2.2 Documentar en la cabecera del script cómo ejecutarlo y que no se importa desde `app/` ni `src/`; verificar con `grep -r "scripts/" app src`, que no debe devolver nada
- [ ] 2.3 Ejecutar el backfill real y verificar el recuento que imprime; revisar a mano al menos 3 consultas contra su transcripción (el peso es el actual, no el objetivo) y confirmar que una segunda ejecución no cambia ninguna fila con peso

## 3. Gráfica de evolución

- [x] 3.1 Extraer `buildEvolutionData(consultations)` como función pura (junto a la página o en `src/services/`) que devuelve `{ label, calorias, peso }` por cada consulta con kcal o peso, en orden cronológico; verificar con tests unitarios: consulta sin peso (`peso: null`), consulta sin kcal (`calorias: null`), consulta sin ninguno de los dos (se excluye) y lista vacía
- [ ] 3.2 Sustituir el `BarChart` de la ficha por un `ComposedChart` con `Bar` de kcal (eje izquierdo) y `Line` de peso (eje derecho, `connectNulls`), renombrar la sección a "Evolución" y ocultarla si `buildEvolutionData` devuelve vacío; verificar en el navegador, con un paciente de varias consultas, que se ven las dos series con sus ejes, que el tooltip muestra "kcal" y "kg" y que una consulta sin peso no corta la línea
- [x] 3.3 Verificar en el navegador que un paciente sin kcal ni peso no muestra la gráfica y que el resto de la ficha se ve igual; ejecutar `npm run lint` y `npx vitest run`

## 4. Documentación

- [x] 4.1 Actualizar `CLAUDE.md` (esquema y ficha del paciente) y `openspec/project.md` si mencionan la gráfica o el peso; verificar que ninguno de los dos contradice que el peso se guarda por consulta y que `patients.weight` es el último conocido
