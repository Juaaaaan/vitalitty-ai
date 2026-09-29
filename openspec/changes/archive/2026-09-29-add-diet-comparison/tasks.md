# Tasks

## 1. Esquema y tipos

- [x] 1.1 Comprobar que `add-weight-history` está archivado (`openspec list` no lo muestra y existe `openspec/specs/patient-evolution/spec.md`); verificar con ese comando antes de empezar
- [x] 1.2 Crear la migración `supabase/migrations/<timestamp>_add_diet_portions_and_changes.sql` con `diet_portions jsonb` y `diet_changes jsonb` nullable en `patient_consultations`; verificar con `list_tables` que las dos columnas existen
- [x] 1.3 Añadir en `src/models/` los tipos `PortionGroup`, `PortionEntry`, `DietPortions`, `DietChanges` y la respuesta de `compare-diets`, y en `src/constants/` la lista de grupos con su descripción; verificar con `npx tsc --noEmit`

## 2. Proyección de raciones

- [x] 2.1 Implementar en `src/services/diet-comparison-service.ts` la función `projectPortions(dietMd)` (D2, D5), con el system como constante TS y salida `json_schema`; verificar con tests que mockean el cliente: el schema no tiene uniones de tipos, un rango se devuelve como `min`/`max`, un grupo no pautado no aparece y una respuesta inválida lanza un error
- [x] 2.2 Implementar `diffPortions(previous, current)` como función pura; verificar con tests: diferencia con la misma unidad, grupo solo en un lado (sin Δ), unidades distintas (sin Δ) y rangos
- [x] 2.3 Crear `app/api/diet-portions/route.ts` (D4): `400` sin `patientId`, `404` con un paciente ajeno, proyección solo de las filas sin `diet_portions` o con una `version` antigua, concurrencia 4 y guardado de cada fila al terminar; verificar con tests de la ruta que cubren esos casos y el de `failed` parcial
- [x] 2.4 Probar `projectPortions` una vez contra la API real con la dieta de `DIET_EXAMPLES` y fijar la salida esperada en un test (hidrato en comida 60 g con la alternativa de patata, cremas 150-200 ml); verificar que el test pasa
- [x] 2.5 Ejecutar `npm run lint` y `npx vitest run` y verificar que pasan

## 3. Comparación por par

- [x] 3.1 Implementar `compareDiets({ previousMd, currentMd, reasonSource })` en el mismo servicio (D5): entradas `added`, `removed` y `summary`; transcripción de N, con `consultation_summary` como respaldo y aviso explícito si no hay ninguno de los dos; verificar con tests del prompt montado (orden de los bloques, respaldo del porqué) y del parseo
- [x] 3.2 Crear `app/api/compare-diets/route.ts` (D4): versión anterior = `max(diet_version) < N` del mismo paciente, reutilizar `diet_changes` si coincide `previousConsultationId` y, si no, calcular (raciones que falten + cambios) en paralelo y guardar; `400`, `404` (ajena o inexistente), `409` con "Esta es la primera dieta del paciente: no hay versión anterior con la que compararla." y `500` con `error`; `maxDuration = 60`; verificar con tests: reutilización sin llamar al modelo, recálculo cuando cambia la anterior, salto de versiones borradas y los cuatro errores
- [x] 3.3 Probar `compareDiets` una vez contra la API real con dos dietas sintéticas (una sustitución de pan blanco por avena y el mismo yogur con otro nombre), primero con una transcripción que da un motivo y luego sin motivo; verificar a mano que el emparejado es correcto, que el resumen cita el motivo en el primer caso y dice que no consta en el segundo, y dejar las dos salidas como fixtures de test
- [x] 3.4 Ejecutar `npm run lint` y `npx vitest run` y verificar que pasan

## 4. UI de comparación

- [x] 4.1 Crear `src/components/patients/diet-comparison.tsx` (D6): `Select` de v2..vmax con la última por defecto, kcal y peso inmediatos con los datos de la página, un indicador mientras llega `compare-diets`, la tabla de raciones con Δ, chips de entran y salen, el resumen, y el error con botón de reintentar; con una sola dieta, "Hace falta una segunda dieta para comparar."; verificar con tests del componente en `__tests__/` (estado de carga, error con reintento y una sola dieta)
- [x] 4.2 Montarlo en `app/dashboard/patient/[id]/page.tsx`; verificar en el navegador con un paciente de 3 o más dietas: se ve la comparación de la última con la anterior, cambiar de versión recalcula, y al volver a abrir la ficha aparece al instante (una sola petición sin llamadas al modelo, visible en la pestaña de red por el tiempo de respuesta)
- [x] 4.3 Verificar en el navegador el caso de error (forzando un fallo de la ruta, p. ej. con la clave del modelo inválida en local): se ve el mensaje, kcal y peso siguen visibles, y reintentar funciona al restaurar la clave

## 5. Gráfica de raciones

- [x] 5.1 Añadir en la ficha la llamada a `POST /api/diet-portions` y un `LineChart` de raciones por grupo (centro del rango, tooltip con el rango y la unidad, leyenda que muestra y oculta grupos), con los datos memorizados con `useMemo`; verificar con un test unitario de la función que construye la serie (rango → centro, grupo ausente → sin punto)
- [x] 5.2 Verificar en el navegador con un paciente con dietas anteriores a este cambio: se ve el indicador de preparación, las raciones aparecen sin recargar y una segunda carga no vuelve a proyectar (las filas ya tienen `diet_portions`); ejecutar `npm run lint` y `npx vitest run`

## 6. Documentación

- [x] 6.1 Actualizar `CLAUDE.md` (Route handlers: `diet-portions` y `compare-diets` con sus errores; Current state vs target: comparación entre citas) y `openspec/project.md` si lo menciona; verificar que ninguno de los dos presenta macros como disponibles y que describen la comparación como pares consecutivos
