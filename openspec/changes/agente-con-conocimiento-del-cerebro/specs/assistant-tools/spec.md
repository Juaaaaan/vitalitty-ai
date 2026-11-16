# Spec Delta

## MODIFIED Requirements

### Requirement: Catálogo cerrado y clasificado

El sistema SHALL ofrecer al asistente un catálogo fijo y conocido de herramientas de dominio. Cada herramienta SHALL declararse como **de lectura** o **de escritura**, y esa clasificación SHALL ser la que determina si se ejecuta sola o requiere confirmación del usuario.

Son de lectura: buscar paciente, obtener paciente, obtener dietas, comparar dietas, estadísticas del paciente, pacientes por criterio, buscar en el conocimiento y leer una sección del conocimiento. Son de escritura: generar dieta y renderizar el PDF de una dieta.

Las herramientas de conocimiento SHALL ser de lectura sin excepción: no hay ninguna herramienta que cree, modifique, active ni retire un documento o un prompt.

Ninguna herramienta SHALL devolver datos de pacientes que no sean del usuario de la sesión, ni revelar si existen. Lo mismo SHALL valer para el conocimiento: ninguna herramienta SHALL devolver documentos de otro usuario ni revelar que existen.

#### Scenario: Herramienta de lectura

- **WHEN** el asistente llama a una herramienta de lectura
- **THEN** se ejecuta y devuelve su resultado sin pedir confirmación

#### Scenario: Herramienta de escritura

- **WHEN** el asistente llama a una herramienta de escritura
- **THEN** no se persiste nada y la llamada se presenta al usuario como propuesta

## ADDED Requirements

### Requirement: Buscar en el conocimiento

El sistema SHALL ofrecer una herramienta de lectura que, dado un texto, devuelva los fragmentos del conocimiento activo del usuario que lo tratan, cada uno identificado por el documento y la sección de la que sale.

La herramienta SHALL acotar cuántos fragmentos devuelve y el tamaño de cada uno: NO SHALL devolver documentos completos, porque un solo documento del Cerebro puede ocupar decenas de miles de caracteres.

La búsqueda SHALL abarcar únicamente la versión activa de los documentos del usuario de la sesión.

Si no hay ningún fragmento pertinente, la herramienta SHALL devolver una lista vacía, no un fragmento aproximado.

#### Scenario: Búsqueda con resultados

- **WHEN** el asistente busca un término que aparece en dos documentos del usuario
- **THEN** recibe fragmentos de ambos, cada uno con su documento y su sección

#### Scenario: Búsqueda sin resultados

- **WHEN** el asistente busca un término que no aparece en ningún documento del usuario
- **THEN** recibe una lista vacía
- **AND** el asistente lo comunica en vez de rellenar con algo parecido

#### Scenario: Documento con versión no activa

- **WHEN** un documento tiene una versión guardada pero no activada que contiene el término
- **THEN** la búsqueda no la devuelve

### Requirement: Leer una sección del conocimiento

El sistema SHALL ofrecer una herramienta de lectura que devuelva el contenido de una sección concreta de un documento de conocimiento del usuario.

Llamada sin indicar sección, la herramienta SHALL devolver la lista de secciones del documento, no su contenido: así el asistente puede elegir sin arrastrar el documento entero a la conversación.

Un documento que no existe o que no es del usuario SHALL responderse como no encontrado, sin revelar si existe para otro.

Una sección que no existe en ese documento SHALL devolver un error descriptivo con las secciones disponibles, de modo que el asistente pueda corregir en la misma vuelta.

#### Scenario: Leer una sección

- **WHEN** el asistente pide una sección existente de uno de sus documentos
- **THEN** recibe su contenido

#### Scenario: Pedir el índice de un documento

- **WHEN** el asistente pide un documento sin indicar sección
- **THEN** recibe la lista de sus secciones
- **AND** no recibe el contenido completo

#### Scenario: Sección inexistente

- **WHEN** el asistente pide una sección que ese documento no tiene
- **THEN** recibe un error que nombra las secciones disponibles
- **AND** la conversación continúa

#### Scenario: Documento de otro usuario

- **WHEN** el asistente pide un documento que pertenece a otro usuario
- **THEN** la herramienta responde como no encontrado
- **AND** no revela ningún contenido suyo
