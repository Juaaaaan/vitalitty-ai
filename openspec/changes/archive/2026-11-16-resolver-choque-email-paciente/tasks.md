# Tasks

## 1. Modelo del conflicto y su comparación

- [x] 1.1 Definir en `src/models/` el tipo del conflicto de identidad —paciente existente identificado, y por cada campo comparado (nombre y apellidos, edad, email, teléfono) los dos valores y su estado `coincide` / `difiere` / `falta`—, y verificar con `npx tsc --noEmit` que compila y que la dieta no forma parte del tipo
- [x] 1.2 Implementar la función que compara una ficha existente con los datos extraídos y produce esa comparación, y verificar con tests los tres estados por campo, incluido el caso de "falta en la ficha existente" frente a "falta en el audio", que no deben confundirse con una discrepancia
- [x] 1.3 Añadir los mensajes en español a `src/constants/patient-memory.ts` (dieta sin guardar, las tres salidas, los rechazos de la resolución) y verificar con un test que ninguno queda vacío, para que no se cuele un mensaje sin traducir

## 2. Detección en la generación

- [x] 2.1 Implementar en `app/api/process-consultation/route.ts` la búsqueda del dueño del email extraído entre los pacientes del usuario, **antes** de intentar crear la ficha, y verificar con un test de ruta que con un email ya ocupado no se crea paciente, no se inserta consulta y no se modifica la ficha existente
- [x] 2.2 Emitir el conflicto como evento propio del stream NDJSON, con la comparación y sin la dieta, y verificar con un test que la petición termina en 200, que el evento `done` no se emite y que el evento de conflicto no lleva `diet_md`
- [x] 2.3 Verificar con tests que no hay falso positivo: extracción sin email, email vacío y email que pertenece a un paciente de otro usuario siguen el camino normal y guardan la consulta
- [x] 2.4 Actualizar el comentario del contrato de `persist()` —hoy promete que un paciente nuevo crea su fila aunque el email exista, que es lo que la base de datos no permite— y verificar leyendo el fichero que ya no contradice a `unique_patient_email_per_user`

## 3. Ruta de resolución

- [x] 3.1 Implementar la ruta `POST` que resuelve un conflicto recibiendo la salida elegida, la dieta y los datos extraídos, y verificar con un test que **no importa** el motor de generación (mismo patrón que el test de `/api/diet-preview` con Chromium), de modo que un reintento no pueda costar una llamada al modelo
- [x] 3.2 Implementar la salida "es el mismo paciente" y verificar con un test que la consulta queda asociada al paciente existente, que el número de pacientes no cambia y que la dieta recibe el número de versión siguiente del histórico de ese paciente
- [x] 3.3 Implementar la salida "el email está mal dictado" y verificar con un test que se crea el paciente sin email y que la ficha que ocupaba ese email queda intacta
- [x] 3.4 Implementar la salida "los datos guardados están mal" y verificar con un test que la ficha existente se actualiza solo con los valores no vacíos de lo extraído —un campo que el audio no menciona no borra el guardado— y que la consulta queda asociada a ella
- [x] 3.5 Implementar la revalidación en servidor (salida dentro del conjunto cerrado, dieta no vacía, paciente del usuario vía RLS) y verificar con tests que una salida desconocida, una dieta vacía y un paciente ajeno se rechazan sin escribir nada y con mensaje en español
- [x] 3.6 Verificar con un test que un fallo al resolver no deja la consulta guardada a medias: o está la consulta con su dieta, o no está nada

## 4. Pantalla de resolución

- [x] 4.1 Implementar en `src/components/diets/` la pantalla del conflicto: comparación campo a campo marcando qué coincide y qué no, enlace al paciente existente, y el aviso de que la dieta todavía no está guardada; verificar en navegador que aparece al provocar un choque
- [x] 4.2 Implementar las tres salidas como acciones separadas que llaman a la ruta con `fetch` (sin Server Actions, regla dura 1) y verificar en navegador que cada una deja la consulta donde dice y que la otra ficha no se toca
- [x] 4.3 Verificar en navegador que con todos los campos coincidentes la pantalla **sigue** pidiendo elegir, y que nada se guarda hasta elegir — el sistema no empareja por su cuenta
- [x] 4.4 Verificar en navegador que tras un fallo de la resolución la dieta sigue en pantalla y se puede reintentar sin regenerar
- [x] 4.5 **No aplica**: la comparación es una tabla HTML simple de cuatro filas, sin TanStack Table, así que no hay `data`/`columns` que memoizar. Si la comparación se pinta con TanStack Table, pasar `data` y `columns` desde estado o `useMemo` (regla dura 3) y verificar en navegador que la pantalla no se congela al abrirse

## 5. Verificación de integración

- [x] 5.1 Verificar en navegador el recorrido completo con el audio real que dicta un email ya registrado: la dieta se genera, aparece el conflicto, se resuelve como "es el mismo paciente" y la consulta queda guardada con esa misma dieta, sin segunda llamada al modelo (comprobar en la consola del servidor que no hay un segundo `Diet generation usage:`)
- [x] 5.2 Verificar en navegador que una consulta de paciente nuevo cuyo email no choca sigue funcionando exactamente igual que antes del cambio, para confirmar que la detección no se ha puesto en el camino de todos
- [x] 5.3 Verificar en navegador que cerrar la pantalla con un conflicto sin resolver pierde la dieta y que el aviso lo había dicho — es el riesgo asumido en `design.md`, y toca comprobar que se avisa, no que no ocurre
- [x] 5.4 Ejecutar `npx vitest run`, `npm run lint` y `npm run build` y verificar que pasan con la ruta nueva publicada
