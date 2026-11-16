# Tasks

## 1. Lectura del conocimiento, aparte de la generación

- [ ] 1.1 Definir en `src/models/` los tipos del índice del conocimiento (documento con título, tipo, etiquetas y lista de secciones) y del fragmento devuelto (documento, sección, texto), y verificar con `npx tsc --noEmit` que compila y que el fragmento no arrastra el documento entero
- [ ] 1.2 Implementar el troceado de un markdown en secciones por encabezado `##`, y verificar con tests los tres casos reales: un documento con 43 secciones, uno con 2 de ~6 KB y uno sin ningún `##` —que degrada a una sola sección con el título del documento
- [ ] 1.3 Implementar en un servicio nuevo (`brain-knowledge-service.ts`) la lectura del índice del conocimiento activo del usuario, sin tocar `loadBrainContext()`, y verificar con un test que solo entran versiones activas y que un documento retirado no aparece
- [ ] 1.4 Implementar la búsqueda por texto sobre las versiones activas, normalizando a minúsculas y sin acentos, y verificar con tests que "suplementacion" encuentra "suplementación" y que un término ausente devuelve lista vacía y no un fragmento aproximado
- [ ] 1.5 Implementar el recorte del fragmento alrededor de la coincidencia y los topes de número y tamaño, y verificar con un test sobre el documento de secciones de 6 KB que tres resultados no arrastran la sección entera
- [ ] 1.6 Implementar la lectura de una sección concreta y, sin sección, la lista de secciones del documento, y verificar con tests que sin sección no se devuelve contenido y que una sección inexistente da error nombrando las disponibles
- [ ] 1.7 Verificar con tests que el servicio nunca lanza: una query caída, un documento sin versión activa y el presupuesto de tiempo agotado devuelven vacío y dejan constancia en el log, como ya hace la retrieval de la generación
- [ ] 1.8 Verificar con un test que la lectura va siempre con el cliente Supabase de la sesión y que, por RLS, el conocimiento de otro usuario no aparece ni se revela que exista
- [ ] 1.9 Verificar con un test que `loadBrainContext()` y la generación de dieta siguen comportándose exactamente igual que antes de este cambio

## 2. Las dos herramientas en el catálogo

- [ ] 2.1 Añadir a `catalog.ts` las definiciones de buscar en el conocimiento y leer una sección, ambas `kind: "read"`, con su validación de argumentos, y verificar con un test que una llamada sin texto de búsqueda y una con un documento inexistente devuelven error descriptivo sin tumbar la vuelta
- [ ] 2.2 Implementar sus ejecutores en `read-tools.ts` y verificar con tests que devuelven documento y sección en cada fragmento, y que nunca devuelven un documento completo
- [ ] 2.3 Verificar con `catalog.test.ts` —la alarma que ya existe— que ninguna herramienta de escritura ha entrado en el despachador de lecturas y que las dos nuevas son de lectura
- [ ] 2.4 Verificar con un test que no existe ninguna herramienta que cree, modifique, active ni retire un documento o un prompt

## 3. El índice en el bloque de sistema

- [ ] 3.1 Componer el bloque de sistema como `rol + reglas → índice del conocimiento`, con el hilo y el encabezado del turno fuera, y verificar con un test que el bloque no contiene la fecha de hoy ni nada del hilo —lo que invalidaría el prefijo en cada vuelta
- [ ] 3.2 Resolver el índice en `agent-loop.ts` antes de la primera llamada al modelo y verificar con un test que, si el índice falla, la vuelta continúa sin él y las herramientas de paciente siguen respondiendo
- [ ] 3.3 Verificar con un test que el tamaño del índice de los seis documentos del `vault/` se mantiene en el orden de 1,5k tokens, y dejar la medida anotada: es la cifra que justifica no inyectar el Cerebro entero

## 4. El prompt: dato y criterio

- [ ] 4.1 Reescribir el bloque de sistema con la separación dato/criterio y la obligación de citar documento y sección, conservando las reglas de nada de URLs, nada de macros en gramos, español y brevedad, y verificar con un test que ninguna de las reglas conservadas ha desaparecido del texto
- [ ] 4.2 Retirar la regla que convertía cualquier pregunta sin herramienta en una negativa, y verificar leyendo el fichero que lo que queda prohibido es inventar un **dato**, no responder una pregunta de criterio
- [ ] 4.3 Subir el modelo a Sonnet y confirmar el identificador exacto contra la API antes de fijarlo; verificar con una vuelta real en navegador que el bucle responde y usa herramientas
- [ ] 4.4 Subir el techo de respuesta a 4.096 y el tope de herramientas por vuelta a 12, y verificar con un test que el mensaje de límite en español sigue cerrando la vuelta al alcanzarlo
- [ ] 4.5 Subir `maxDuration` a 180 en `app/api/assistant/route.ts` y verificar que `npm run build` pasa; anotar que exige plan por encima de Hobby, como las dos rutas que generan

## 5. Verificación de comportamiento en navegador

Las reglas de prompt no se demuestran con tests unitarios: este grupo es el que comprueba el riesgo central del cambio.

- [ ] 5.1 Verificar en navegador una pregunta de criterio ("¿qué suplementación le conviene a esta paciente?"): el asistente localiza el material sin que se le diga el documento, responde y **cita** documento y sección
- [ ] 5.2 Verificar en navegador una pregunta mixta ("¿cuánta proteína lleva su dieta actual y es lo adecuado para su objetivo?"): la cantidad sale de la dieta consultada y la valoración del conocimiento, y se distingue cuál es cuál
- [ ] 5.3 Verificar en navegador que una pregunta que invita a inventar un dato ("¿cuánto pesa?", sin haber consultado) **no** produce una cifra: consulta la herramienta o dice que no lo sabe
- [ ] 5.4 Verificar en navegador que una pregunta de criterio que ningún documento cubre se responde diciendo que no hay material propio sobre eso, y separando lo que es criterio propio
- [ ] 5.5 Verificar en navegador que pedirle editar un documento del Cerebro responde que eso se hace en el Cerebro, y comprobar en la base de datos que no se ha creado ninguna versión
- [ ] 5.6 Verificar en navegador que una acción fuera del catálogo (borrar un paciente) sigue respondiéndose como que no puede hacerse, y que no se modifica ningún dato
- [ ] 5.7 Verificar en navegador que las escrituras no han cambiado: pedir un retoque de dieta sigue produciendo una propuesta que no guarda nada hasta confirmarla, y descartarla deja los datos intactos
- [ ] 5.8 Verificar en navegador con el Cerebro vacío (usuario sin documentos) que una pregunta de criterio lo dice y la conversación continúa

## 6. Medición y cierre

- [ ] 6.1 Medir en navegador y anotar: una vuelta con una sola lectura de conocimiento, una con dos, y una que además compare dietas en frío — contra el `maxDuration = 180` nuevo y contra los 3,3 s / 7,6 s / ~35 s medidos antes del cambio
- [ ] 6.2 Verificar en navegador que la segunda vuelta seguida da en caché y anotar la diferencia: es lo que justifica meter el índice en el bloque de sistema y no en el hilo
- [ ] 6.3 Ejecutar `npx vitest run`, `npm run lint` y `npm run build` y verificar que pasan
- [ ] 6.4 Actualizar `CLAUDE.md` —la sección del asistente, la línea de `/asistente`, el route handler y los tiempos medidos— y `openspec/project.md` si el criterio de dato/criterio merece quedar como dirección de fase; verificar leyendo los ficheros que ningún párrafo sigue diciendo que el asistente solo sabe lo que devuelven las herramientas de paciente
