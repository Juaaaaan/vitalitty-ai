# Tasks

## 1. Núcleo de la comparación

- [ ] 1.1 Implementar en `src/components/cerebro/version-diff.tsx` el agrupado del resultado del LCS en tramos con 3 líneas de contexto a cada lado, devolviendo los tramos y cuántas líneas se omiten entre ellos, y verificar con tests que un cambio en la última línea de un documento de 1.400 líneas produce **un** tramo y que lo omitido suma las líneas restantes
- [ ] 1.2 Implementar la fusión de tramos cuyos contextos se solapan y verificar con un test que dos cambios a cuatro líneas de distancia salen en un solo tramo, no en dos con la misma línea repetida
- [ ] 1.3 Implementar el recuento de líneas añadidas y quitadas y verificar con un test que coincide con los cambios del tramo, contando una línea reescrita como una añadida y una quitada
- [ ] 1.4 Implementar el diff por palabras sobre pares `removed`/`added` contiguos, reutilizando el LCS existente con otro tokenizado, y verificar con tests que "1,6 g/kg" → "2,0 g/kg" dentro de una línea de prosa marca solo ese fragmento
- [ ] 1.5 Implementar el umbral de parecido que decide si un par se compara por palabras o se deja como línea quitada y línea añadida, y verificar con tests los dos lados: una cifra corregida se empareja, y dos párrafos distintos que solo comparten preposiciones **no** se emparejan
- [ ] 1.6 Fijar el valor del umbral comparando versiones reales de `vault/PROTOCOLO_MAESTRO_PROMPTS_EDITOR_VITALITTY_v2_01-10-2026.md` y `vault/COMPENDIO_PUBMED_VITALITTY_01-10-2026.md`, y dejar en el código el número elegido con el motivo; verificar que los tests de 1.5 siguen pasando con él
- [ ] 1.7 Implementar el caso de la primera versión como un estado propio —no hay anterior— en lugar de comparar contra cadena vacía, y verificar con un test que no devuelve el documento entero como añadido
- [ ] 1.8 Verificar con un test que dos versiones de contenido idéntico siguen dando el estado "no cambia nada" que ya existe hoy

## 2. Presentación de la comparación

- [ ] 2.1 Pintar los tramos con las líneas envueltas (`whitespace-pre-wrap`, sin `<pre>` sin envolver) y verificar en navegador que una línea de 112 caracteres del Recetario se lee entera sin desplazamiento horizontal
- [ ] 2.2 Pintar el canal de número de línea con `::before`/`content` y verificar en navegador que al seleccionar y copiar tres líneas lo copiado es el texto del documento, sin los números
- [ ] 2.3 Pintar lo omitido como un `<details>` con "⋯ N líneas sin cambios ⋯" y verificar en navegador que se despliega con ratón y con teclado, y que al desplegarlo los cambios siguen señalados donde estaban
- [ ] 2.4 Quitar el `line-through` de las líneas quitadas, dejando fondo y símbolo de canal, y verificar en navegador que una línea quitada se distingue en claro y en oscuro
- [ ] 2.5 Pintar el resaltado intra-línea y verificar en navegador que sobre un párrafo del PROTOCOLO con una cifra corregida se ve el fragmento, no la línea entera en dos colores
- [ ] 2.6 Pintar el recuento ("4 + · 1 −") en la cabecera de la comparación y verificar en navegador que coincide con lo que se ve
- [ ] 2.7 Implementar ir al cambio siguiente y al anterior y verificar en navegador que recorre los tres cambios de un documento con cambios dispersos y que en el último no finge que hay otro
- [ ] 2.8 Implementar el mensaje de la primera versión y verificar en navegador que "Ver cambios" en la v1 dice en español que es la primera y no pinta el documento como añadido

## 3. La comparación, en superficie propia

- [ ] 3.1 Sacar la comparación del `<li>` del histórico a un `Dialog` de `max-w-5xl` y `85vh` con desplazamiento propio, y verificar en navegador que abrirla y cerrarla sobre una versión a mitad del histórico deja la lista exactamente como estaba
- [ ] 3.2 Verificar en navegador que el contenido de la comparación no empuja al resto de la página y que el histórico no salta al abrirla
- [ ] 3.3 Medir en navegador cuánto tarda en abrirse la comparación del documento de 1.380 líneas y anotarlo; si el hilo se bloquea de forma perceptible, decirlo aquí en lugar de acotar el algoritmo sin medida (riesgo registrado en `design.md`)

## 4. El editor de documento, fuera del panel lateral

- [ ] 4.1 Sustituir el `Sheet` de `documents-tab.tsx` por un diálogo casi a pantalla completa que siga recibiendo el formulario de metadata por `children` de `VersionedEditor`, y verificar en navegador que editar, guardar, activar y restaurar un documento siguen funcionando igual
- [ ] 4.2 Verificar en navegador que los filtros por tipo y por etiqueta, la selección de fila y el borrado de un documento siguen funcionando tras el cambio de superficie — es el trozo con más riesgo de arrastrar un detalle sin querer
- [ ] 4.3 Verificar en navegador que el borrador sin guardar sobrevive a abrir y cerrar la comparación desde dentro del editor, y que cambiar de documento sigue remontando el editor (`key`) con el contenido de la versión activa

## 5. El resto de la maquetación de `/cerebro`

- [ ] 5.1 Añadir el primitivo con `npx shadcn@latest add tabs` (nunca a mano: regla dura 4) y verificar que el fichero aparece en `src/components/ui/` sin editarlo
- [ ] 5.2 Pasar las pestañas de `brain-console.tsx` a `Tabs` y verificar en navegador que se cambia de pestaña con las flechas del teclado y que `src/components/cerebro/__tests__/brain-console.test.tsx` sigue pasando (actualizándolo si consultaba el `role="tab"` hecho a mano)
- [ ] 5.3 Dejar visible la columna de etiquetas de la tabla de documentos en pantallas medianas y verificar en navegador a 1.280 px que se ven las etiquetas, que es lo que `knowledge-documents` ya exige del listado
- [ ] 5.4 Separar la barra de acciones del editor para que el aviso de guardado no empuje el textarea al aparecer, y verificar en navegador que guardar no mueve el contenido bajo el cursor

## 6. Verificación de integración

- [ ] 6.1 Verificar en navegador el recorrido completo sobre un prompt real: editar, guardar, ver los cambios de la versión nueva frente a la anterior, y activarla — comprobando que lo que la comparación decía que cambió es lo que se activó
- [ ] 6.2 Verificar en navegador el mismo recorrido sobre el documento más largo del `vault/` y que ningún paso obliga a desplazarse en horizontal
- [ ] 6.3 Ejecutar `npx vitest run`, `npm run lint` y `npm run build` y verificar que pasan
- [ ] 6.4 Actualizar en `CLAUDE.md` la línea de `/cerebro` para que describa la comparación y la superficie del editor como quedan, y verificar leyendo el fichero que no describe ya el panel lateral
