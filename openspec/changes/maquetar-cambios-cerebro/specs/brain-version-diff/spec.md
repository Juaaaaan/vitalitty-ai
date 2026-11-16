# Spec Delta

## Purpose

Cómo se le enseña al usuario la diferencia entre dos versiones del Cerebro, para que pueda comprobar qué se tocó antes de activar una. Prompts y documentos de conocimiento se editan con la misma pieza, así que comparten este contrato.

## ADDED Requirements

### Requirement: La comparación muestra lo que cambió, no el documento entero

Al comparar dos versiones, el sistema SHALL mostrar los tramos que contienen cambios, cada uno con unas pocas líneas sin cambios alrededor para dar contexto.

El texto sin cambios que queda fuera de esos tramos NO SHALL mostrarse desplegado. En su lugar el sistema SHALL indicar cuántas líneas se han omitido y SHALL permitir desplegarlas si el usuario las quiere ver.

El esfuerzo de llegar a un cambio NO SHALL depender del tamaño del documento: un cambio en la última línea de un documento largo SHALL ser visible sin recorrer el documento.

#### Scenario: Un cambio al final de un documento largo

- **WHEN** el usuario compara dos versiones de un documento de más de mil líneas que difieren solo en la última
- **THEN** ve ese cambio sin recorrer las líneas anteriores
- **AND** las líneas sin cambios aparecen plegadas, indicando cuántas son

#### Scenario: Cambios dispersos por el documento

- **WHEN** las dos versiones difieren en tres sitios alejados entre sí
- **THEN** ve tres tramos, cada uno con su contexto
- **AND** entre ellos, el texto sin cambios aparece plegado

#### Scenario: Desplegar el contexto

- **WHEN** el usuario despliega un tramo plegado
- **THEN** ve las líneas sin cambios que contenía
- **AND** los cambios siguen señalados donde estaban

#### Scenario: Dos versiones con el mismo contenido

- **WHEN** el usuario compara dos versiones cuyo contenido es idéntico
- **THEN** el sistema se lo dice en vez de mostrar una comparación vacía

### Requirement: La comparación dice cuánto cambió y deja llegar a cada cambio

El sistema SHALL mostrar, junto a la comparación, cuántas líneas se añadieron y cuántas se quitaron.

El sistema SHALL permitir ir al cambio siguiente y al anterior sin desplazarse por el texto a mano.

#### Scenario: Recuento de lo cambiado

- **WHEN** el usuario abre la comparación de una versión que añadió cuatro líneas y quitó una
- **THEN** ve que se añadieron cuatro y se quitó una

#### Scenario: Recorrer los cambios

- **WHEN** la comparación tiene varios cambios y el usuario pide el siguiente
- **THEN** la vista se sitúa en el cambio siguiente
- **AND** al llegar al último, el sistema no finge que hay otro

### Requirement: Dentro de una línea se señala qué cambió

Cuando una línea de la versión anterior y una de la nueva se corresponden y difieren solo en parte, el sistema SHALL señalar las partes que cambiaron dentro de la línea, no solo que la línea entera es distinta.

Cuando la línea se ha reescrito de arriba abajo, el sistema SHALL presentarla como línea quitada y línea añadida, sin inventar correspondencias dentro de ella.

El sistema NO SHALL codificar el mismo hecho de tres maneras a la vez: una línea quitada se distingue una vez, no con color, tachado y símbolo simultáneamente.

#### Scenario: Una cifra corregida

- **WHEN** entre dos versiones solo cambia "1,6 g/kg" por "2,0 g/kg" dentro de una línea de prosa
- **THEN** el usuario ve señalado ese fragmento dentro de la línea
- **AND** no se le presenta la línea completa como quitada y vuelta a escribir

#### Scenario: Un párrafo reescrito

- **WHEN** una línea se ha reescrito por completo
- **THEN** se presenta como una línea quitada y una línea añadida

### Requirement: El texto cambiado se lee sin desplazamiento horizontal

Las líneas de la comparación SHALL envolver dentro del ancho disponible. El usuario NO SHALL tener que desplazarse en horizontal para leer una línea cambiada, sea cual sea su longitud.

Cada línea mostrada SHALL poder identificarse por su posición en el documento, y ese indicador NO SHALL confundirse con el contenido ni entrar en la selección cuando el usuario copie texto.

#### Scenario: Línea más larga que el ancho disponible

- **WHEN** una línea cambiada mide más caracteres de los que caben a lo ancho
- **THEN** se muestra envuelta y se lee entera sin desplazamiento horizontal

#### Scenario: Copiar un fragmento de la comparación

- **WHEN** el usuario selecciona y copia varias líneas de la comparación
- **THEN** lo copiado es el texto del documento, sin los números de línea

### Requirement: La primera versión no tiene nada con lo que compararse

Cuando la versión que el usuario quiere comparar es la primera de su histórico, el sistema SHALL decirle que no hay versión anterior con la que compararla, en español.

El sistema NO SHALL compararla contra un contenido vacío ni presentar el documento completo como añadido.

#### Scenario: Ver cambios en la versión 1

- **WHEN** el usuario pide ver los cambios de la primera versión de un prompt
- **THEN** el sistema le dice que es la primera y que no hay versión anterior
- **AND** no muestra el documento entero marcado como añadido

### Requirement: Abrir la comparación no desordena el histórico

Abrir o cerrar la comparación de una versión NO SHALL mover de sitio las demás versiones del histórico.

Al cerrar la comparación, el usuario SHALL seguir viendo la versión desde la que la abrió.

La comparación SHALL disponer de su propio desplazamiento, de modo que su contenido no empuje al resto de la página.

#### Scenario: Abrir y cerrar una comparación a media lista

- **WHEN** el usuario abre la comparación de una versión que está a mitad del histórico y la cierra
- **THEN** sigue viendo esa misma versión en la lista
- **AND** las versiones anteriores y posteriores están donde estaban
