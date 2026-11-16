# Proposal

## Why

En `/cerebro`, "Ver cambios" no lleva al cambio: vuelve a pintar el documento entero con dos líneas de color en algún sitio. El diff emite **todas** las líneas, incluidas las iguales, dentro de una caja de 320 px de alto en la que caben 16; el `PROTOCOLO_MAESTRO_PROMPTS_EDITOR_v2` tiene 1.380 líneas, así que un cambio al final queda a 86 pantallas de scroll. Encima va dentro de un `<pre>` que no envuelve, y el `VITALITTY_Recetario_Maestro_141_Platos` promedia 112 caracteres por línea donde caben ~93: leer una línea cambiada obliga a desplazarse también en horizontal.

La consecuencia no es estética. Activar una versión es el acto que cambia la siguiente dieta (`prompt-versioning`, "Activar una versión es un acto explícito"), y hoy el paso previo —comprobar qué se tocó— es lo bastante incómodo como para saltárselo. Un diff que no se lee es una comprobación que no se hace.

## What Changes

- La comparación entre versiones pasa a mostrar **solo los tramos con cambios**, con unas pocas líneas de contexto alrededor y el resto plegado y desplegable, en lugar del documento completo.
- La comparación indica **cuántas líneas se añadieron y se quitaron** y permite saltar de un cambio al siguiente sin recorrer el texto.
- Cuando una línea cambia poco, se señala **qué cambió dentro de ella**; hoy una palabra corregida pinta la línea entera en rojo y otra entera en verde, que sobre prosa no dice nada.
- El texto cambiado se lee **sin desplazamiento horizontal**: las líneas largas envuelven y el número de línea va en un canal propio.
- Comparar la **primera versión** dice que no hay nada con lo que compararla, en vez de pintar el documento entero como añadido (hoy compara contra la cadena vacía).
- La comparación deja de vivir **dentro de la fila del histórico** y pasa a una superficie propia con alto suficiente, para que abrirla no hinche la lista ni haga perder el sitio.
- El editor de un documento de conocimiento deja de estar limitado al ancho del panel lateral: 40 KB de markdown no se editan ni se comparan en 768 px.
- La tabla de documentos vuelve a mostrar las **etiquetas** en pantallas medianas. Hoy la columna se oculta por debajo de `xl`, y las etiquetas son justo lo que decide si un documento entra en la generación — `knowledge-documents` ya exige que se vean.
- Las pestañas del Cerebro pasan al componente de pestañas de shadcn/ui, con navegación por teclado, en lugar de botones con `role="tab"` puesto a mano.

Nada de esto toca la base de datos, las rutas, el motor de generación ni el contenido de ningún documento. El diff se seguirá calculando en cliente, sin pedir nada al servidor.

## Capabilities

### New Capabilities

- `brain-version-diff`: cómo se le presenta al usuario la diferencia entre dos versiones del Cerebro —prompts y documentos de conocimiento comparten el mismo editor, así que comparten un único contrato— para que pueda comprobar qué se tocó antes de activar.

### Modified Capabilities

- `prompt-versioning`: el requisito "Histórico con diferencias y restauración" exige hoy comparar "mostrando qué texto cambió", sin decir nada de cómo se llega al cambio. Delega esa parte en `brain-version-diff` y se queda con el histórico y la restauración.

## Impact

**Código afectado** — solo componentes de cliente:

- `src/components/cerebro/version-diff.tsx`: hoy devuelve el LCS completo línea a línea. Pasa a agrupar los cambios en tramos, a resolver el detalle dentro de la línea y a dejar de pintar lo que no cambió.
- `src/components/cerebro/versioned-editor.tsx`: la comparación sale del `<li>` del histórico.
- `src/components/cerebro/documents-tab.tsx`: superficie de edición del documento y columna de etiquetas.
- `src/components/cerebro/brain-console.tsx`: pestañas.
- Posible `npx shadcn@latest add tabs` / `collapsible`. Nunca a mano: `src/components/ui/` son ficheros generados (regla dura 4).

**Sin impacto**: ninguna migración, ninguna ruta nueva ni modificada, ningún cambio en `prompts`, `prompt_versiones`, `documentos_conocimiento` ni `documento_versiones`, ninguna llamada a modelo, ningún fichero en Storage. El Cerebro no guarda nada en el bucket `diets`; este cambio no lo toca.

**Reglas duras que lo enmarcan**: nada de Server Actions —el diff no necesita servidor, se calcula en cliente sobre texto que la página ya tiene (regla dura 1 no llega a aplicar porque no hay petición nueva); `src/components/ui/` solo por CLI (regla dura 4). La tabla de documentos usa `<Table>` de shadcn, no TanStack Table, así que la regla dura 3 no aplica; si la comparación o la tabla pasaran a TanStack Table, `data` y `columns` tendrían que venir de estado o `useMemo`.
