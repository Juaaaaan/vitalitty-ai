# Tasks

## 1. Agenda real

- [x] 1.1 Crear la migración `supabase/migrations/*_create_appointments.sql` con la tabla `appointments` (`id`, `patient_id` nullable con FK, `start_time`/`end_time` `timestamptz`, `type`, `status`, `notes`, `created_by`, `created_at`), RLS `created_by = auth.uid()` para select/insert/update/delete e índice `(created_by, start_time)`; verificar aplicándola y comprobando que un usuario no lee las citas de otro
- [x] 1.2 Sustituir el mock de `src/services/calendar-service.ts` por consultas a Supabase en `getAppointmentsForMonth` y `getWeeklySummary`, sin cambiar sus firmas ni el tipo `Appointment`; verificar que `npx vitest run app/dashboard/calendar/__tests__/page.test.tsx` sigue pasando
- [x] 1.3 Añadir a `calendar-service` la consulta por rango con filtro opcional de tipo y estado, con el paciente resuelto a nombre e id, y test unitario que cubra rango con resultados, rango vacío y filtro por tipo `revision`
- [x] 1.4 Añadir `scripts/seed-appointments.ts` para sembrar citas de prueba en local; verificar abriendo `/dashboard/calendar` en el navegador: mes con citas muestra las sembradas, mes sin citas aparece vacío

## 2. Extracción a servicios de lo reutilizable

- [x] 2.1 Extraer de `app/api/compare-diets/route.ts` a un servicio la lógica de leer/guardar `diet_changes` y decidir si recalcular; la ruta pasa a llamarlo. Verificar que los tests existentes de comparación siguen pasando y que la ruta responde igual (200, 409 en primera dieta, 404 en consulta ajena)
- [x] 2.2 Extraer de `app/api/diet-pdf/route.ts` a `diet-pdf-service` el hash, la reutilización del PDF guardado, la subida y la firma de la URL; la ruta pasa a llamarlo. Verificar en el navegador que aprobar una dieta y volver a pedir su PDF sigue sirviendo el guardado sin re-renderizar
- [x] 2.3 Añadir a `diet-generation-service` el modo instrucción: la pasada acepta una instrucción en lenguaje natural en lugar de la transcripción, con el mismo bloque estático y el mismo orden de prompt. Test unitario sobre el cuerpo de la petición: el bloque estático es idéntico byte a byte en ambos modos y la instrucción cae después de la memoria del paciente

## 3. Catálogo de herramientas

- [x] 3.1 Crear `src/models/assistant/` con los tipos del catálogo (definición, clasificación `read`/`write`, resultado) y `src/services/assistant/tools.ts` con el registro vacío; verificar que `npm run lint` y `tsc` pasan
- [x] 3.2 Implementar las herramientas de lectura de paciente: `buscar_paciente` (nombre/correo, tope de resultados) y `get_paciente` (ficha + resúmenes vía `patient-context-service`, sin documentos de dieta). Tests: un resultado, homónimos, sin coincidencias, paciente ajeno → no encontrado
- [x] 3.3 Implementar `get_dietas` (versiones de la más reciente a la más antigua, documento completo solo si se piden pocas, metadatos del resto) y `estadisticas_paciente` (reusa `patient-evolution-service`, sin macros, valores ausentes como ausentes). Tests: paciente sin dietas, consulta sin peso
- [x] 3.4 Implementar `comparar_dietas` sobre el servicio extraído en 2.1: reutiliza la comparación guardada, ajusta versiones no consecutivas al par consecutivo y lo declara, error explicativo en primera dieta o versión inexistente. Tests de los tres casos
- [x] 3.5 Implementar `pacientes_por_criterio` sobre la consulta por rango de 1.3: cita/revisión en rango, sin consulta desde una fecha, sin ninguna dieta; criterio no cubierto → error explicativo. Tests de cada criterio y del rango vacío
- [x] 3.6 Declarar `generar_dieta` y `render_pdf` como herramientas de escritura, con su definición y validación de argumentos pero **sin ejecutor en el bucle**; test que recorre el catálogo y comprueba que ninguna herramienta `write` es ejecutable desde el despachador de lectura

## 4. Bucle del agente y rutas

- [x] 4.1 Escribir el prompt del agente como constante TS (rol, catálogo, reglas: no responder de memoria, no adivinar entre homónimos, comunicar listas vacías como vacías) con el corte de caché al final del system y el hilo después; test que comprueba que el bloque estático no varía entre peticiones
- [x] 4.2 Implementar el bucle de tool-use en `src/services/assistant/` (modelo → `tool_use` → despachador → `tool_result` → modelo), con tope de 8 iteraciones y cierre en español al alcanzarlo, y con las herramientas de escritura emitiendo propuesta en lugar de ejecutarse. Tests con el modelo simulado: vuelta sin herramientas, vuelta con dos lecturas encadenadas, vuelta que topa el límite, herramienta que falla, herramienta inexistente
- [x] 4.3 Crear `app/api/assistant/route.ts` con `maxDuration = 60`, stream NDJSON de eventos `text` / `tool_start` / `tool_end` / `proposal` / `error` / `done`, `401` sin sesión y `400` con hilo vacío o inválido; verificar con `curl` que los eventos llegan por línea conforme se producen
- [x] 4.4 Crear `app/api/assistant/confirm/route.ts` con `maxDuration = 60` propio, que revalida acción, argumentos y propiedad del paciente antes de ejecutar, ejecuta `generar_dieta` (guarda versión nueva vía trigger, sin transcripción) o `render_pdf`, y responde en español ante fallo sin dejar nada a medias. Tests: acción desconocida → 400, paciente ajeno → 404, generación correcta → consulta nueva con `diet_version` N+1

## 5. Sección Asistente

- [x] 5.1 Crear `app/asistente/page.tsx` y los componentes de `src/components/assistant/` (hilo, cuadro de entrada, indicador de herramienta en curso) leyendo el stream NDJSON; si alguna vista usa TanStack Table, `data` y `columns` con referencia estable (regla 3). Verificar en el navegador que una pregunta simple responde de forma incremental
- [x] 5.2 Añadir el enlace del Asistente a la barra lateral y verificar en el navegador que la sección es accesible y que `/diets` sigue funcionando igual de principio a fin
- [x] 5.3 Implementar la entrada por voz reutilizando el grabador y `POST /api/transcribe`: el texto cae en el cuadro de entrada sin enviarse. Verificar en el navegador con el micrófono falso (audio de `public/audio_example`) que el texto aparece editable y que un fallo de transcripción muestra el error en español sin enviar nada
- [x] 5.4 Implementar la tarjeta de propuesta con Confirmar / Descartar, que llama a `/api/assistant/confirm` y devuelve el resultado al hilo. Verificar en el navegador: descartar no crea nada, recargar con la propuesta pendiente no crea nada, confirmar crea la versión nueva y el asistente lo comunica
- [x] 5.5 Documentar en `CLAUDE.md` la sección `/asistente`, sus dos rutas y la regla de lecturas libres / escrituras confirmadas, y actualizar la nota de que el calendario ya no es mock; verificar que lo escrito no contradice `openspec/project.md`

## 6. Verificación de extremo a extremo

- [x] 6.1 En el navegador, preguntar "¿qué pacientes tienen revisión esta semana?" con citas sembradas y comprobar que la lista coincide con la agenda, y que una semana sin citas responde que no hay ninguna
- [x] 6.2 En el navegador, pedir "compara la última dieta de <paciente> con la anterior" y comprobar que responde con calorías, peso, raciones, alimentos que entran y salen y el porqué, y que repetirlo no recalcula
- [x] 6.3 En el navegador, pedir un retoque de dieta, comprobar que no se guarda nada hasta confirmar, confirmar y verificar en la ficha del paciente que aparece la versión nueva con la anterior intacta
- [x] 6.4 Medir en el navegador cuánto tarda una vuelta con varias herramientas y la confirmación de una generación, y anotar el resultado frente a `maxDuration = 60` en el estado del cambio
- [x] 6.5 Comprobar el aislamiento entre usuarios: con una segunda cuenta, pedir al asistente datos de un paciente de la primera por su id y verificar que responde como no encontrado, sin filtrar ningún dato
