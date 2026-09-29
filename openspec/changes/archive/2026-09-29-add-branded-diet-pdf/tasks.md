# Tasks

## 1. Base de despliegue y dependencias

- [x] 1.1 Unificar `next.config.ts` en un único `export default`, eliminando el `module.exports` muerto y conservando `bodySizeLimit`; verificar con `npm run build` sin avisos de configuración y comprobando que el valor de `bodySizeLimit` aparece en la configuración resuelta.
- [x] 1.2 Añadir `serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"]` a esa configuración; verificar que `npm run build` completa sin intentar empaquetar Chromium.
- [x] 1.3 Instalar `puppeteer-core` y `@sparticuz/chromium`; verificar con `npm install` correcto y `npm run build` en verde.
- [x] 1.6 Migración que amplía el bucket `diets` a `application/pdf` y 5 MB; sin ella toda subida de PDF falla con un `500` genérico. Verificado contra la base real: una subida que fallaba pasa a devolver URL firmada.
- [x] 1.4 Migración SQL en `supabase/migrations/` que añade `pdf_path text null` y `pdf_source_hash text null` a `patient_consultations`; verificar que las filas existentes quedan a `null` consultando la tabla tras aplicarla.

## 2. Recursos de marca sin sistema de ficheros

- [x] 2.1 Extraer el logo y el icono de Instagram del PDF de referencia, recortarlos a fondo transparente y dejarlos como data URI en un módulo de constantes; verificar con un test que la constante decodifica a una imagen válida y que ningún módulo de `src/` importa `fs` ni `path`.
- [x] 2.2 Añadir Tinos y Carlito (subconjunto latino, woff2) como data URI en el mismo módulo, con su nota de licencia; verificar con un test que cada constante decodifica a un woff2 válido y midiendo que el peso total queda documentado en el propio módulo.
- [x] 2.3 Definir los tokens de color y las medidas de la tabla de `design.md` como constantes; verificar con un test que los hex coinciden exactamente con los valores especificados.

## 3. Contrato del markdown y parser

- [x] 3.1 Declarar el contrato (frontmatter y secciones) como tipos y constantes en `src/models/` y `src/constants/`; verificar con `npx tsc --noEmit`.
- [x] 3.2 Implementar el parser de documento a estructura tipada, con días y turnos inferidos del encabezado; verificar con tests que cubren: documento completo, sección ausente, sección desconocida, plan por turnos y documento sin frontmatter.
- [x] 3.3 Añadir un test con una de las dietas ya guardadas (sin frontmatter) que confirme que el parser la marca como modo crudo y no lanza.

## 4. Plantilla de marca

- [x] 4.1 Implementar la plantilla HTML + CSS con portada y cuerpo, y los generadores de cabecera y pie para `headerTemplate`/`footerTemplate`, todos alimentados por las mismas constantes de marca; verificar con un test de snapshot del HTML.
- [x] 4.2 Reservar en `page.pdf()` márgenes mayores que el alto de cabecera y pie, y marcar cada bloque de día con `break-inside: avoid`; verificar en una dieta larga renderizada a PDF que ningún texto queda bajo el pie y que ningún día se parte.
- [x] 4.3 Test que renderiza dos dietas de contenido distinto y comprueba que las porciones de cabecera y pie del HTML son idénticas byte a byte entre ambas.
- [x] 4.4 Test de que la plantilla omite sin hueco las secciones ausentes y no maqueta las desconocidas.

## 5. Vista previa

- [x] 5.1 Route handler de vista previa que devuelve el HTML de la plantilla para un `diet_md`, sin importar `puppeteer-core`; verificar con un test que la respuesta contiene los elementos de marca y con `npm run build` que la ruta no arrastra Chromium.
- [x] 5.2 Mostrar la vista previa en `/diets` tras la generación; verificar en el navegador que aparece maquetada y que no se sube nada a Storage.
- [x] 5.3 Mostrar en modo crudo las dietas sin frontmatter; verificar en el navegador abriendo una consulta anterior a este cambio.

## 6. Edición del documento

- [x] 6.1 Route handler `PUT` que reescribe `diet_md` de una consulta del usuario, con `400` en documento vacío y `404` en consulta ajena, ambos con `error` en español; verificar con tests de los tres casos.
- [x] 6.2 Botón _Modificar_ con `textarea` en `/diets` que llama a ese endpoint con `fetch` y refresca la vista previa; verificar en el navegador editando una cena y viéndola cambiar en la vista previa.
- [x] 6.3 Test de que la edición no altera `diet_version` ni crea una consulta nueva.

## 7. Exportación a PDF

- [x] 7.1 Servicio de render que abre Chromium, imprime la portada y el cuerpo en dos pasadas y las une con `pdf-lib`, con su `maxDuration` propio; verificar generando un PDF en local y comprobando página a página que la portada no lleva cabecera ni pie y que el resto sí, numeradas.
- [x] 7.2 Route handler de PDF con la política de caché: reutiliza si `pdf_source_hash` coincide con el hash del `diet_md` actual, regenera y re-sube si no; verificar con tests de los tres caminos (sin PDF, hash coincidente, hash distinto).
- [x] 7.3 Subida a `diets/{user_id}/{patient_id}/{consultation_id}.pdf` y devolución de URL firmada; verificar que el objeto aparece en el bucket y que la URL caduca, y con un test que una consulta ajena devuelve `404` en español.
- [x] 7.4 Rechazar la exportación de un documento sin frontmatter con el mensaje en español acordado; verificar con un test.
- [x] 7.5 Botón _Aprobar_ en `/diets` que dispara la exportación y ofrece la descarga; verificar en el navegador que hasta pulsarlo no existe PDF y que tras pulsarlo se descarga.

## 8. Ficha de paciente

- [x] 8.1 Por cada consulta con `pdf_path`, ofrecer ver o descargar el PDF con URL firmada, sin renderizar; verificar en el navegador con un paciente con varias dietas aprobadas.
- [x] 8.2 Indicar que no hay PDF en las consultas sin él en lugar de ofrecer una descarga que falle; verificar en el navegador con una consulta anterior a este cambio.

## 9. Sincronización con la generación

- [x] 9.1 Reescribir `src/constants/diet-examples.ts` al contrato, con frontmatter y sin macros; verificar pasando el ejemplo por el parser en un test y comprobando que produce estructura completa.
- [x] 9.2 Actualizar el bloque estático del prompt de `src/services/diet-generation-service.ts` para exigir el contrato, manteniendo el corte de caché donde está; verificar con un test que el bloque estático sigue siendo idéntico byte a byte entre dos construcciones y que el contexto de paciente queda después.
- [x] 9.3 Generar una dieta real y comprobar en el navegador que su documento cumple el contrato y se maqueta con la plantilla sin caer a modo crudo.

## 10. Documentación

- [x] 10.1 Actualizar `CLAUDE.md` y `openspec/project.md`: nuevos route handlers, columnas `pdf_path` y `pdf_source_hash`, contrato del markdown y convención del `.pdf` junto al `.md` en el bucket `diets`; verificar que ninguna afirmación contradice a la otra ni declara hecho lo que no lo está.
- [x] 10.2 Documentar en el módulo de marca el origen de colores, medidas y tipografías (PDF de referencia) y las licencias de Tinos y Carlito; verificar que el módulo lo recoge.

## 11. Verificación de integración

- [x] 11.1 `npm run lint` y `npm run test` en verde.
- [x] 11.2 Recorrido completo en el navegador: generar → vista previa → modificar → aprobar → descargar → abrir desde la ficha del paciente.
- [x] 11.3 Renderizar dos dietas de contenido muy distinto y comparar visualmente los PDF: portada, logo, paleta y pie idénticos entre sí. Comparación visual manual una vez contra `public/diets_example/SANDRA_DE_GREGORIO_5.pdf` para dar por buena la fidelidad de marca.
- [x] 11.4 Medir en el navegador el tiempo del paso de aprobar con la función fría y ajustar `maxDuration` si se queda corto; dejar el número medido anotado en `CLAUDE.md`.
