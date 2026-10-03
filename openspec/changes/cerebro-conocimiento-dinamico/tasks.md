# Tasks

## 1. Esquema en Supabase

- [ ] 1.1 Escribir la migración de `prompts` y `prompt_versiones` en `supabase/migrations/` (cabecera con `slug` único por usuario, `nombre`, `tipo`, `version_activa_id`; versiones con `prompt_id`, `version`, `contenido`, `nota_cambio`, `created_at`, `created_by`) y verificar que `supabase db reset` la aplica sin error y que `list_tables` muestra las dos tablas con sus FK
- [ ] 1.2 Añadir en la misma migración `documentos_conocimiento` y `documento_versiones` (`slug`, `titulo`, `tipo` como enum cerrado, `tags text[]`, `siempre_incluir bool`, `version_activa_id`; versiones con `documento_id`, `version`, `contenido_md`, `created_at`, `created_by`) y verificar igual
- [ ] 1.3 Añadir RLS `created_by = auth.uid()` en las cuatro tablas, con `INSERT`/`SELECT` en las tablas de versiones y **sin** `UPDATE` ni `DELETE`, y verificar con dos usuarios de prueba que uno no ve ni modifica las filas del otro y que un `UPDATE` sobre una versión existente es rechazado
- [ ] 1.4 Añadir el trigger que asigna `version` como máximo del padre + 1 (mismo patrón que `diet_version`) y verificar con dos inserciones concurrentes sobre el mismo padre que no se repite ningún número
- [ ] 1.5 Regenerar los tipos TypeScript de Supabase y verificar que `npm run build` compila con las cuatro tablas tipadas

## 2. Semilla de los prompts actuales

- [ ] 2.1 Extraer las instrucciones de generación hoy embebidas en `src/services/diet-generation-service.ts` a `DEFAULT_PROMPTS` en `src/constants/` (sin cambiar su texto) y verificar con un test que el bloque estático compuesto es idéntico byte a byte al anterior al cambio
- [ ] 2.2 Escribir `scripts/seed-prompts.ts` que inserte un prompt por tipo con su versión 1 activa tomando el contenido **de esas constantes**, no de una copia pegada, y verificar que tras ejecutarlo `prompt_versiones.contenido` de la versión activa coincide carácter a carácter con la constante
- [ ] 2.3 Añadir un test que falle si `DEFAULT_PROMPTS` queda vacío o pierde un tipo, para que el fallback no desaparezca por descuido en un refactor posterior

## 3. Endpoints de prompts

- [ ] 3.1 Implementar `GET /api/prompts` (lista con la versión activa de cada prompt, solo los del usuario de la sesión) y verificar con un test de ruta que un prompt de otro usuario no aparece y que sin sesión responde `401`
- [ ] 3.2 Implementar `GET /api/prompts/[id]/versiones` (histórico ordenado con número, fecha y nota) y verificar con un test que un `id` ajeno responde `404` y no filtra contenido
- [ ] 3.3 Implementar `POST /api/prompts/[id]/versiones` (crea versión, **no** activa; nota de cambio opcional; rechaza contenido vacío y contenido idéntico al de la versión activa con un mensaje en español) y verificar con tests que la versión activa no cambia y que los dos rechazos devuelven `400` con `error`
- [ ] 3.4 Implementar `POST /api/prompts/[id]/activar` (mueve `version_activa_id`, registra la fecha de activación, rechaza una versión que no pertenezca a ese prompt o a otro usuario) y verificar con tests el camino bueno y los dos rechazos
- [ ] 3.5 Añadir un test que recorra crear versión → activar → restaurar y compruebe que restaurar crea una versión nueva con el contenido antiguo, no reutiliza un número y deja el histórico intacto

## 4. Endpoints de documentos

- [ ] 4.1 Implementar `GET /api/documentos` con filtro por `tipo` y por etiqueta, y verificar con tests que el filtro combinado devuelve lo esperado y que no aparecen documentos de otro usuario
- [ ] 4.2 Implementar `POST /api/documentos` (crea documento con metadata y su versión 1) revalidando en servidor que el contenido es markdown y no está vacío, y verificar con tests que un contenido no-markdown y uno vacío se rechazan con `400` y mensaje en español, sin crear nada
- [ ] 4.3 Implementar `GET /api/documentos/[id]/versiones` y `POST /api/documentos/[id]/versiones` con la misma mecánica que los prompts, y verificar con tests que crear versión no activa y que la validación de markdown también se aplica aquí
- [ ] 4.4 Implementar `POST /api/documentos/[id]/activar` y la edición de metadata (`tipo`, `tags`, `siempre_incluir`) **sin** crear versión de contenido, y verificar con tests que cambiar etiquetas no toca `documento_versiones`

## 5. Retrieval

- [ ] 5.1 Implementar `src/services/brain-retrieval-service.ts`: prompt activo por tipo + documentos por `tipo`/`tags` cruzados con el perfil del paciente + los de `siempre_incluir`, en una sola query con `JOIN` a la versión activa, deduplicados y ordenados por `slug`; verificar con tests que un documento sin versión activa no entra, que uno que encaja por dos criterios aparece una vez y que el orden es estable entre llamadas
- [ ] 5.2 Implementar el fallback: sin versión activa, con error de query o al agotar su presupuesto de tiempo, devuelve `DEFAULT_PROMPTS` y ningún documento, y registra en el servidor que se usó el camino degradado; verificar con tests que simulen error y timeout de la query que la función resuelve en lugar de lanzar
- [ ] 5.3 Añadir un test que compruebe que el resultado del retrieval no contiene timestamps, ids ni números de versión — solo contenido —, porque cualquiera de ellos rompería la caché de prefijo
- [ ] 5.4 Verificar con un test que el retrieval ejecutado con el cliente de un usuario no devuelve prompts ni documentos de otro, ni los marcados `siempre_incluir`

## 6. Integración con la generación

- [ ] 6.1 Componer el bloque estático en `src/services/diet-generation-service.ts` como prompt activo → documentos seleccionados → dietas de ejemplo, con el contrato del documento concatenado siempre después del prompt activo como parte no editable, y verificar con un test que el orden es ese y que el contrato está presente aunque el prompt activo no lo mencione
- [ ] 6.2 Llamar al retrieval desde `app/api/process-consultation/` antes de la primera llamada al modelo, con el cliente Supabase de la sesión, y verificar con un test de ruta que el conjunto se resuelve una sola vez por petición
- [ ] 6.3 Verificar con un test que el bloque estático generado con el Cerebro sembrado es idéntico byte a byte al que producía el código antes del change (la comprobación que hace válida la semilla)
- [ ] 6.4 Actualizar `src/services/__tests__/diet-contract-sync.test.ts` o añadir el equivalente para que la alarma de desincronización del contrato siga valiendo ahora que las instrucciones pueden venir de la BD, y verificar que el test falla si el contrato deja de concatenarse
- [ ] 6.5 Medir en navegador una generación completa con el Cerebro sembrado y anotar el tiempo frente a los 59,6 s del peor caso conocido, para saber cuánto margen consume el retrieval dentro de `maxDuration = 60`

## 7. UI — pestaña Prompts

- [ ] 7.1 Crear `app/cerebro/` con las dos pestañas y el componente de editor versionado en `src/components/cerebro/` (textarea, Guardar, Activar, histórico, Restaurar), y verificar en navegador que la página carga y cambia de pestaña
- [ ] 7.2 Conectar el listado de prompts por tipo con la versión activa marcada, llamando a `/api/prompts` con `fetch` (sin Server Actions), y verificar en navegador que se ven los prompts sembrados y cuál está activo
- [ ] 7.3 Implementar Guardar y Activar como acciones separadas y verificar en navegador que guardar deja la versión activa como estaba y que activar la cambia, recargando la página para confirmar que persiste
- [ ] 7.4 Implementar el histórico con diff textual frente a la versión anterior y el botón Restaurar, y verificar en navegador que restaurar una versión antigua crea una versión nueva y el histórico anterior sigue completo
- [ ] 7.5 Si el listado usa TanStack Table, pasar `data` y `columns` desde estado o `useMemo` y verificar en navegador que la pestaña no se congela al abrir y al filtrar (regla dura 3)

## 8. UI — pestaña Documentación

- [ ] 8.1 Implementar la zona de arrastrar y soltar / botón Adjuntar que acepta **solo** `.md` y rechaza cualquier otro formato antes de subir, con el mensaje "Sube el documento en formato Markdown (.md)", y verificar en navegador soltando un `.pdf` que no se sube nada y el mensaje aparece
- [ ] 8.2 Implementar el formulario de metadata al subir (`tipo`, `tags`, `siempre_incluir`) y el listado filtrable por tipo y etiqueta, y verificar en navegador que un documento recién subido aparece con su metadata y responde a los filtros
- [ ] 8.3 Reutilizar el editor versionado de la pestaña Prompts para el contenido del documento (Guardar, Activar, histórico, Restaurar) y verificar en navegador que el ciclo completo funciona sobre un documento
- [ ] 8.4 Implementar el aviso informativo cuando el tamaño conjunto de los documentos `siempre_incluir` supera el umbral, fijando el umbral a partir del tamaño real medido de los documentos de `vault/`, y verificar en navegador que el aviso aparece al pasarlo y que la acción se completa igualmente

## 9. Carga del vault existente

- [ ] 9.1 Revisar los ficheros de `vault/` y dejar anotado qué hay que corregir antes de cargarlos, empezando por el recetario de 141 platos que salió sucio de su conversión desde Word; verificar que la nota de revisión queda entregada en el change
- [ ] 9.2 Escribir `scripts/load-vault.ts` (nunca importado desde `app/` ni `src/`) que cree un documento por fichero con su `tipo`, sus `tags` y su versión 1 activa, y verificar tras ejecutarlo que cada fichero tiene su documento y que su contenido coincide con el del fichero

## 10. Verificación de integración

- [ ] 10.1 Verificar en navegador que una generación con el Cerebro recién sembrado, sin que nadie haya editado nada, produce una dieta equivalente en estructura y calidad a la actual, y que su vista previa en `/diets` se reconoce como estructurada
- [ ] 10.2 Verificar en navegador que activar una versión nueva del prompt de generación se refleja en la siguiente generación, sin redespliegue
- [ ] 10.3 Verificar con la tabla de documentos vacía, y después provocando un fallo de la query, que la generación se completa igualmente por el camino del fallback y que la consulta queda guardada con su dieta
- [ ] 10.4 Medir el cache-hit del bloque estático en dos generaciones consecutivas sin cambios en el Cerebro, y de nuevo tras activar una versión, y anotar que la primera posterior al cambio se factura en frío y las siguientes vuelven a cachear
