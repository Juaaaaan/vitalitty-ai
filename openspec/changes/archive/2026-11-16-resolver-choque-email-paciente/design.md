# Design

## Context

Ver `proposal.md` — Why para la motivación. Lo que condiciona el enfoque:

- **La generación y la escritura están pegadas.** `POST /api/process-consultation` genera en streaming y, al cerrarse el stream limpiamente, inserta el paciente (si es nuevo) y la consulta. El `insert` del paciente es el que estalla, así que el fallo llega cuando el modelo ya se pagó.
- **`unique_patient_email_per_user` existe y es correcto.** No está en `supabase/migrations/`: se creó antes, fuera del repo. No se toca — un email identifica a una persona.
- **El email aparece tarde.** Lo saca la extracción, que corre **en paralelo** con la generación justo para no bloquearla. No se puede validar antes de generar sin serializar las dos cosas y añadir su latencia al presupuesto.
- **Vercel serverless.** La generación está en `maxDuration = 180` tras medir 86 s con el dictado completo; la resolución no genera y no necesita presupuesto especial. Sin sistema de ficheros (regla dura 2): una dieta pendiente no se puede dejar en disco. El cuerpo de la petición de resolución lleva el markdown completo, ~11,5 KB medidos, muy por debajo del límite de Vercel.
- **El cliente solo habla con route handlers** (regla dura 1). La resolución es una ruta nueva, no una Server Action.

## Goals / Non-Goals

**Goals:**

- Que un choque de email no cueste nunca una generación.
- Que el usuario pueda distinguir los tres errores con los datos delante, y que el sistema no elija por él.
- Caber en el flujo actual sin migración y sin tabla nueva.

**Non-Goals:**

- Que una dieta pendiente sobreviva al cierre de la pestaña. Se descarta a propósito (ver Decisions).
- Fusionar fichas duplicadas que ya existan en la base de datos.
- Detectar duplicados por nombre, teléfono o parecido: el disparador es **solo** el email, que es el campo con la restricción única. Un homónimo sin email compartido sigue creando su ficha, como hoy.
- Tocar el flujo de paciente existente, que no choca nunca.

## Decisions

### La dieta pendiente espera en el navegador

Al cerrarse el stream con conflicto, el markdown ya está íntegro en la pantalla —se ha ido pintando mientras llegaba—. La pantalla lo retiene y, al resolver, lo manda a la ruta de resolución.

_Alternativa descartada:_ aparcarla en el servidor. `patient_consultations.patient_id` es obligatorio, así que haría falta una tabla de consultas sin paciente, o un estado "pendiente" más un paciente provisional que habría que limpiar — migración, limpieza de huérfanos y un estado nuevo que todo lo que lee consultas tendría que aprender a ignorar. Mucho cambio para una ventana de segundos. **El precio es real y se asume:** si se cierra la pestaña antes de resolver, la dieta se pierde, y la pantalla lo dice.

### El conflicto es un evento del stream, no un error

El stream NDJSON gana un evento de conflicto junto a `thinking` / `text` / `error` / `done`. La petición termina con 200: la generación fue bien, lo que falta es decidir de quién es.

_Alternativa descartada:_ responder un `409`. El stream ya está abierto y con la dieta dentro cuando se descubre el choque; cambiar el código de estado a posteriori no se puede, y convertirlo en `error` obligaría al cliente a distinguir "error con dieta aprovechable" de "error de verdad" por el texto del mensaje.

### La detección va antes del `insert`, con una consulta propia

Antes de intentar crear la ficha, se busca el dueño de ese email entre los pacientes del usuario. Si existe, no se escribe nada y se compone el conflicto.

_Alternativa descartada:_ intentar el `insert` y mirar el código de error de Postgres (`23505`). Funciona, pero deja la decisión colgando del nombre de una restricción creada fuera del repo, y para armar la comparación habría que consultar al dueño del email igualmente. Una consulta explícita dice lo que quiere decir.

### La extracción sigue en paralelo

No se serializa generación y extracción para validar antes. El choque es raro; serializar encarecería **todas** las consultas en el presupuesto que ya se mide en 86 s.

_Alternativa descartada:_ extraer primero y generar después. Añade la latencia de la extracción a cada generación para evitar un caso infrecuente, y el change que las puso en paralelo lo hizo justamente por eso.

### Las tres salidas son del dominio, no de la UI

Las tres salidas —mismo paciente, email mal dictado, datos guardados mal— viajan como un valor cerrado que la ruta de resolución revalida. No se manda "qué hacer" en forma de operaciones (crear/actualizar/asociar), se manda **cuál de los tres errores era**.

_Alternativa descartada:_ que el cliente mande las operaciones a ejecutar. Convierte la ruta en un ejecutor genérico de escrituras sobre `patients`, que es exactamente lo que el asistente evita con su separación lectura/escritura. Un valor cerrado se revalida; una lista de operaciones hay que autorizarla entera.

### La resolución no sabe generar

La ruta de resolución importa lo que persiste y nada del motor de generación, igual que `/api/diet-preview` no importa Chromium. Así es imposible que un reintento cueste otra llamada al modelo.

_Alternativa descartada:_ reutilizar `process-consultation` con una bandera de "solo guardar". Mezcla dos presupuestos de tiempo y dos superficies de validación en una ruta que ya es la más cargada del proyecto.

### Prompts y caché

Este cambio no toca los prompts. El bloque estático de la generación —instrucciones, documentos del Cerebro y dietas de ejemplo, en ese orden— sigue intacto, y con él su corte de caché: el bloque cacheado va primero y nada específico del paciente entra antes. La resolución no llama al modelo, así que no participa en la caché.

## Risks / Trade-offs

- **Se cierra la pestaña con un conflicto sin resolver → la dieta se pierde.** → Aviso explícito en pantalla mientras está pendiente. Es el precio de no meter migración; si llega a doler, aparcar en servidor es un change posterior que no invalida este.
- **El usuario elige "los datos guardados están mal" sobre la ficha equivocada y sobreescribe datos buenos.** → La comparación se enseña campo a campo antes de elegir, y solo se actualiza con valores no vacíos de lo extraído, así que un campo que el audio no menciona no borra el guardado.
- **Dos consultas en vuelo con el mismo email nuevo.** → La restricción única sigue siendo el árbitro: la segunda resolución que intente crear fallará y la pantalla lo dirá, con la dieta todavía en mano.
- **El email extraído viene mal normalizado** ("arroba", "punto") y no choca cuando debería. → Lo normaliza la extracción, que ya tiene esa regla; si falla, el caso degrada a lo que pasa hoy con cualquier email nuevo: se crea la ficha. No empeora nada.
- **El conflicto enseña datos de un paciente que el usuario quizá no tenía en mente.** → Son pacientes del propio usuario, filtrados por RLS como todo lo demás; no cruza datos entre consultas.

## Migration Plan

Sin migración de base de datos: el cambio consiste en respetar una restricción que ya existe.

Despliegue directo, y reversible volviendo al comportamiento anterior: sin el cambio, un choque vuelve a ser una excepción con la dieta perdida, que es el estado de hoy. No queda dato nuevo que limpiar, porque el flujo no escribe nada hasta que el usuario resuelve.
