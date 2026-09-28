# diet-generation Specification

## Purpose

Produce el documento de dieta de un paciente a partir de la transcripción de su consulta, en una sola pasada y con dietas reales de ejemplo en contexto, y lo entrega a pantalla conforme se genera. El documento markdown resultante es la fuente de verdad de la dieta.

## Requirements

### Requirement: Generación del documento en una sola pasada

El sistema SHALL producir el documento de dieta en una única llamada de generación que reciba en contexto, en este orden: las instrucciones con las reglas nutricionales, al menos una dieta real completa como ejemplo, el contexto del paciente, y la transcripción de la consulta.

La salida SHALL ser el documento de dieta en markdown, ya formateado y listo para mostrar, sin pasos intermedios de extracción a estructura fija ni relleno de plantilla.

La estructura del documento generado SHALL corresponderse con la de las dietas de ejemplo: las mismas secciones, el mismo orden y el mismo nivel de detalle, salvo donde el contenido de la consulta justifique una diferencia.

#### Scenario: Consulta transcrita de un paciente nuevo

- **WHEN** se solicita la generación para una transcripción de consulta y un paciente sin dieta anterior
- **THEN** el sistema devuelve un documento de dieta en markdown
- **AND** su estructura de secciones se corresponde con la de las dietas de ejemplo
- **AND** el contenido refleja lo dicho en la transcripción, no valores de relleno

#### Scenario: La consulta no encaja en la estructura habitual

- **WHEN** la transcripción describe un caso que no cubre la estructura de los ejemplos
- **THEN** el documento se adapta al caso en lugar de forzar secciones vacías o inventadas para encajar en una plantilla

### Requirement: Entrega en streaming

El sistema SHALL entregar el documento a la pantalla de forma incremental, conforme se genera, sin esperar a que la generación termine.

El primer fragmento de texto SHALL aparecer en pantalla en pocos segundos desde que se lanza la generación. El usuario SHALL poder leer el documento mientras se escribe.

#### Scenario: El usuario lanza la generación

- **WHEN** el usuario confirma el paciente y lanza la generación
- **THEN** en pocos segundos empieza a aparecer texto en pantalla
- **AND** el documento sigue creciendo de forma visible hasta completarse

#### Scenario: La generación falla a mitad

- **WHEN** la generación se interrumpe después de haber emitido texto
- **THEN** el usuario ve un error explicando que la dieta quedó incompleta
- **AND** el texto ya emitido permanece visible en lugar de desaparecer

### Requirement: Las revisiones editan la dieta anterior

Cuando el paciente ya tiene una dieta anterior, el sistema SHALL incluirla en el contexto de la generación, junto con la memoria del paciente (ficha y resúmenes de sus consultas recientes), e instruir al modelo para que **edite** la dieta anterior según lo dicho en la consulta, conservando lo que no se cuestiona.

Una revisión SHALL preservar las partes de la dieta anterior que la transcripción no menciona, y SHALL respetar las intolerancias, alergias y preferencias conocidas del paciente que la transcripción no retire. No SHALL regenerarse el documento en frío ignorando la dieta previa ni la memoria del paciente.

La existencia de dieta anterior SHALL determinarse por el paciente elegido explícitamente por el usuario, nunca por coincidencias en la transcripción.

#### Scenario: Revisión que cambia una sola cosa

- **WHEN** se genera la dieta de un paciente con dieta anterior y la transcripción solo habla de subir la proteína
- **THEN** el documento resultante refleja ese cambio
- **AND** el resto del plan se mantiene reconocible respecto a la dieta anterior

#### Scenario: Revisión que no repite restricciones conocidas

- **WHEN** se genera la dieta de un paciente existente con alergia a los frutos secos registrada y la transcripción no la menciona
- **THEN** el documento resultante no incluye frutos secos

#### Scenario: Primera consulta del paciente

- **WHEN** el paciente no tiene ninguna dieta anterior registrada
- **THEN** la generación procede sin bloque de dieta previa y produce el documento desde cero

### Requirement: Orden del prompt y caché del bloque estático

El contenido que no varía entre consultas — instrucciones y dietas de ejemplo — SHALL ocupar el principio del prompt y SHALL marcarse para caché. El contenido específico de la consulta — contexto del paciente y transcripción — SHALL ir después, fuera del prefijo cacheado.

El bloque estático SHALL ser idéntico byte a byte entre peticiones. No SHALL contener marcas de tiempo, identificadores de petición, ni ningún valor que cambie entre llamadas.

#### Scenario: Segunda generación dentro de la ventana de caché

- **WHEN** se lanza una generación y poco después otra distinta
- **THEN** la segunda reutiliza el bloque estático desde caché en lugar de volver a facturarlo íntegro

#### Scenario: Cambia el contexto del paciente

- **WHEN** dos generaciones consecutivas son de pacientes distintos
- **THEN** el bloque estático se sigue sirviendo desde caché
- **AND** solo el contexto de paciente y la transcripción se facturan como entrada nueva

### Requirement: Persistencia al cerrar el stream

Al completarse la generación, el sistema SHALL guardar la consulta con el documento generado, su número de versión dentro del paciente y, si está disponible, el resumen breve de la consulta, sin intervención del usuario.

Si la generación falla antes de completarse, no SHALL guardarse una consulta con una dieta incompleta ni SHALL consumirse un número de versión.

La subida del documento a almacenamiento de ficheros SHALL seguir siendo una acción explícita del usuario, independiente de este guardado.

#### Scenario: Generación completada

- **WHEN** el stream se cierra con el documento completo
- **THEN** queda registrada una consulta con la transcripción, el documento de dieta, su versión y su resumen
- **AND** el usuario ve en pantalla la versión de la dieta guardada
- **AND** el usuario puede a continuación subir el documento a almacenamiento como paso aparte

#### Scenario: Generación interrumpida

- **WHEN** la generación falla antes de completarse
- **THEN** no queda registrada ninguna consulta con dieta parcial
- **AND** la siguiente dieta completada de ese paciente recibe el número de versión que habría tenido la interrumpida

### Requirement: Las dietas de ejemplo viven en el código

Las dietas de ejemplo que entran en contexto SHALL estar disponibles sin acceso al sistema de ficheros en tiempo de ejecución.

Añadir una dieta de ejemplo más NO SHALL requerir cambiar la forma del prompt ni la lógica de generación.

#### Scenario: Ejecución en entorno sin filesystem

- **WHEN** la generación se ejecuta en el entorno serverless de despliegue
- **THEN** las dietas de ejemplo están disponibles en contexto sin leer ningún fichero en runtime

#### Scenario: Se añade una segunda dieta de ejemplo

- **WHEN** se incorpora otra dieta real al conjunto de ejemplos
- **THEN** entra en el bloque estático junto a las existentes sin modificar la lógica de generación
