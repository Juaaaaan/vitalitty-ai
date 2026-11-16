# Design

## Context

Todo lo que entra aquí vive en cuatro componentes de cliente de `src/components/cerebro/`. No hay ruta, ni tabla, ni modelo, ni fichero en Storage por medio.

Lo que condiciona el enfoque, medido sobre el `vault/` que está cargado:

| documento                                | líneas | bytes  | chars/línea |
| ---------------------------------------- | ------ | ------ | ----------- |
| `PROTOCOLO_MAESTRO_PROMPTS_EDITOR_v2`    | 1.380  | 40.550 | 29          |
| `Biblioteca_Maestra_Suplementacion_v1`   | 1.042  | 22.462 | 22          |
| `COMPENDIO_PUBMED`                       | 718    | 51.783 | 72          |
| `VITALITTY_Recetario_Maestro_141_Platos` | 288    | 32.233 | 112         |

Y la caja en la que se pinta hoy: dentro de un `Sheet` de `sm:max-w-3xl` (768 px), dentro del `<li>` del histórico (`p-2`), dentro de un `<pre className="max-h-80 p-3 text-xs">`. Quedan ~680 px de ancho y 320 px de alto; con `leading-relaxed` sobre `text-xs` caben 16 líneas, y en mono a 12 px caben ~93 caracteres.

El contenido real es **prosa**: párrafos de una línea cada uno. Esto no es código, y los diffs de línea están pensados para código.

## Goals / Non-Goals

**Goals:**

- Que el coste de encontrar un cambio no dependa del tamaño del documento.
- Que sobre prosa se vea **qué** cambió, no solo en qué línea.
- Que leer un cambio no exija desplazarse en dos ejes.
- Que la comparación tenga sitio: fuera de la fila del histórico y fuera del panel lateral.

**Non-Goals:**

- No se toca cómo se guardan, versionan, activan ni seleccionan prompts y documentos. Guardar y activar siguen siendo actos distintos.
- No se toca el contenido de ningún prompt ni documento, ni cómo se compone el bloque estático de la generación.
- No se añade comparación entre dos versiones cualesquiera: se sigue comparando una versión con la **anterior**, como hasta ahora.
- No se vuelve editable el histórico: las tablas de versiones siguen siendo solo-inserción.
- No entra el asistente. Es el otro cambio.

## Decisions

### Tramos con contexto plegado, no documento completo

La comparación agrupa los cambios en tramos y muestra **3 líneas** sin cambios a cada lado. Lo que queda entre tramos se pliega en una línea que dice cuántas son y se despliega al pulsarla.

Tres líneas porque sobre prosa una sola no sitúa (una frase cambiada sin su párrafo no se entiende) y cinco ya reintroduce el problema en documentos con cambios cercanos.

- **Descartado: virtualizar la lista completa** (`react-window` o equivalente). No resuelve el problema —seguirías recorriendo 1.380 líneas para llegar a la última— y añade una dependencia y un contenedor con altura fija que pelea con el envolver de las líneas largas. La queja no es que pintar sea lento: es que hay demasiado que mirar.
- **Descartado: mostrar solo las líneas cambiadas, sin contexto.** Sobre prosa deja al usuario sin saber en qué sección estaba la frase.

### El plegado, con `<details>` nativo

Cada tramo plegado es un `<details>` con su `<summary>`. Cero JavaScript, estado propio del navegador, y el teclado funciona solo.

- **Descartado: `Collapsible` de shadcn/ui.** Anima la altura, y una animación que desplaza el contenido justo mientras el usuario está leyendo el cambio de al lado es peor que no animar nada.

### Diff dentro de la línea, por palabras y solo cuando la línea se parece

Cuando un `removed` y un `added` quedan contiguos y se parecen por encima de un umbral, se vuelve a comparar el par **por palabras** y se señalan los fragmentos distintos. Si no se parecen, se dejan como línea quitada y línea añadida.

El umbral existe para no inventar correspondencias: dos párrafos distintos que comparten "de", "la" y "con" producirían un resaltado que miente.

- **Descartado: diff por caracteres.** Sobre prosa española con acentos y palabras largas sale confeti: media palabra marcada, la otra no.
- **Descartado: traer `jsdiff` / `diff-match-patch`.** El LCS que hace falta ya está escrito en `version-diff.tsx` y es el mismo algoritmo sobre otra unidad; se reutiliza cambiando el tokenizado. Una dependencia nueva para 40 líneas que ya existen no se paga.

### El LCS se mantiene en cliente, y se mantiene a mano

Se sigue calculando en el navegador, con `useMemo` al abrir y no en cada render. No hay petición nueva, así que no hay ruta ni regla dura 1 que aplicar: el texto de las dos versiones ya está en la página porque el histórico lo trae con su contenido.

El coste es `O(n·m)` en tiempo y memoria: 1.380 × 1.380 ≈ 1,9 millones de celdas en el documento más largo. Es lo que ya hace hoy, pero conviene medirlo porque este cambio hará que la comparación se abra mucho más a menudo.

- **Descartado: calcularlo en el servidor.** Añadiría una ruta, un viaje y un presupuesto de tiempo de Vercel a algo que el navegador ya tiene todo para hacer. Y el `maxDuration` del plan es un recurso que hace falta en las rutas que generan, no aquí.

### La comparación se abre en un diálogo casi a pantalla completa

`Dialog` de ancho `max-w-5xl` y alto acotado a `85vh`, con su propio desplazamiento. Se abre desde el botón de la fila del histórico y, al cerrarse, el histórico está exactamente como estaba: es lo que exige el requisito de no desordenar la lista, y sale gratis porque el diálogo no ocupa sitio en el flujo.

- **Descartado: ruta propia `/cerebro/.../cambios`.** El borrador del editor vive en `useState` del componente y el padre lo remonta con `key`; navegar fuera lo tira. Comparar no puede costarle al usuario lo que llevara escrito.
- **Descartado: ensanchar el `<li>` y dejar el diff dentro.** Es el problema de partida: hincha la fila 320 px o más y hace perder el sitio en la lista.

### El editor de documento también sale del panel lateral

El `Sheet` de `sm:max-w-3xl` desaparece y el editor de un documento se abre en un diálogo casi a pantalla completa, con el formulario de metadata dentro, como ya lo recibe `VersionedEditor` por `children`.

- **Descartado: ensanchar el `Sheet`.** Un panel lateral más ancho sigue siendo un panel lateral: 40 KB de markdown no se editan ni se comparan asomados por un lado de la pantalla. Y el diff dentro del sheet era justo el caso peor.

### Codificación de las líneas: fondo y canal, sin tachado

Una línea quitada se distingue por el color de fondo y por el `−` de su canal. Se quita el `line-through`.

- **Descartado: mantener el tachado** por no depender solo del color. El símbolo del canal ya cubre eso, y el tachado sobre prosa en monoespaciada es exactamente lo que no quieres cuando lo que intentas es leer la frase que se quitó.

### El canal de números va fuera de la selección

El número de línea se pinta con `::before` y `content`, de modo que no entra en lo que el usuario copia. Con un `<span>` por número, copiar tres líneas se lleva los números pegados al texto.

### Pestañas del Cerebro, al primitivo de shadcn/ui

`brain-console.tsx` pasa de `Button` con `role="tab"` puesto a mano a `Tabs`, añadido por CLI (`npx shadcn@latest add tabs`), nunca a mano: `src/components/ui/` son ficheros generados (regla dura 4).

- **Descartado: arreglar el teclado sobre los botones actuales.** Reimplementar el patrón ARIA de pestañas —flechas, `aria-controls`, foco— cuando el primitivo ya lo trae resuelto.

### Nada de esto toca la caché del prompt

No se modifica el contenido de ningún prompt ni documento, ni el orden en que se compone el bloque estático de la generación (`prompt activo + contrato → documentos seleccionados → dietas de ejemplo`). El corte de caché sigue donde estaba, y este cambio no invalida ningún prefijo: lo que invalida la caché es **activar** una versión, y este cambio no cambia qué hace activar.

### Restricciones de Vercel serverless que condicionan el enfoque

- **Sin filesystem** (regla dura 2): no aplica porque no se lee nada en runtime; los documentos vienen de Postgres, como ya venían.
- **Tiempo de ejecución**: el diff es de cliente, así que no consume `maxDuration` de ninguna ruta. Esa es parte del motivo de no moverlo al servidor.
- **Tamaño de body**: no hay petición nueva. El contenido de las versiones ya llega en el `GET` del histórico que la página hace hoy.

## Risks / Trade-offs

- **El `Ctrl+F` del navegador no encuentra lo que está plegado.** Es el precio de plegar. Se compensa con el recuento de cambios, la navegación entre ellos y que todos los tramos se puedan desplegar; y el buscador del navegador tampoco servía de mucho en 86 pantallas.
- **El umbral de parecido es un juicio.** Demasiado bajo y el diff intra-línea empareja párrafos que no tienen nada que ver; demasiado alto y una frase retocada vuelve a salir como línea entera. Hay que fijarlo con los documentos reales del `vault/`, no con texto inventado.
- **El `O(n·m)` sigue ahí y ahora se ejecutará más.** Si al abrir el diálogo sobre el documento de 1.380 líneas se nota el bloqueo del hilo, hay margen de sobra para acotarlo después (comparar por secciones, o avisar y pedir confirmación en documentos enormes), pero no se adelanta sin medirlo.
- **Tres líneas de contexto pueden no bastar** en una sección densa. El desplegable es la válvula; si en uso real se despliega siempre, el número está mal elegido y se sube.
- **Sacar el editor del `Sheet` toca más código que el diff.** Es el trozo con más riesgo de arrastrar un detalle de la pestaña de documentos (filtros, selección, borrado) sin querer, y conviene hacerlo después del diff y por separado.
