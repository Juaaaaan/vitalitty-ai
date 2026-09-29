# Design

## Context

Ver `proposal.md` — Why. Aquí solo el estado y las restricciones que condicionan el
enfoque.

**Lo que ya existe**: `diet_md` en `patient_consultations` es la fuente de verdad;
`POST /api/upload-diet` sube el `.md` al bucket privado `diets` bajo
`{user_id}/{patient_id}/{consultation_id}.md` y guarda esa **ruta** (no una URL) en
la columna `documento_url`, cuyo nombre es legado. El enlace se firma al abrirlo.

**Restricciones de Vercel serverless que mandan sobre el diseño:**

1. **Sin filesystem en runtime** (regla dura 2). Ni `readFileSync`, ni
   `path.join(process.cwd(), "public", …)`. Logo, icono y fuentes van como
   constantes TypeScript en base64.
2. **Tamaño de función**. `@sparticuz/chromium` ronda los 50 MB descomprimidos. El
   límite de Vercel es 250 MB por función; cabe, pero solo la función de PDF debe
   cargarlo. Por eso el render de PDF vive en su propio route handler y la vista
   previa **no** lo importa.
3. **Tiempo de ejecución**. Arranque en frío de Chromium + render. El route de PDF
   declara su propio `maxDuration`; no reutiliza el presupuesto ya apretado de
   `process-consultation`.
4. **Tamaño de body**. El `PUT` de edición manda un `diet_md` completo. El límite
   por defecto (1 MB) sobra para un markdown, pero `next.config.ts` está mal
   formado y conviene arreglarlo en este cambio (ver decisión 8).

**Especificación visual extraída del PDF de referencia.** `SANDRA_DE_GREGORIO_5.pdf`
**no** es una imagen: lleva texto, fuentes embebidas y geometría, y de ahí salen
estos valores (fuente: `pdffonts`, `pdfimages`, y los operadores del content
stream). Esta tabla es la especificación de la plantilla:

| Elemento                                     | Valor                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Página                                       | A4, 595 × 842 pt                                                                        |
| Caja de texto (pág. 2+)                      | x = 81.7 pt, ancho 431.5 pt → márgenes laterales ≈ 82 pt (28.9 mm)                      |
| Caja de texto (vertical)                     | y = 85.1 pt desde abajo, alto 670.3 pt → tope del cuerpo a 86.6 pt del borde superior   |
| Logo (pág. 2+)                               | 59.4 × 51.7 pt, arriba a la derecha, a 35.4 pt del borde superior y 85.1 pt del derecho |
| Logo (portada)                               | caja de 205.7 × 179.2 pt, centrado, entre dos reglas horizontales                       |
| Icono Instagram (portada)                    | 103.3 × 55.9 pt, centrado, con `@vitalittynutri` en negrita debajo                      |
| Pie (pág. 2+)                                | x = 82.55 pt, ancho 429.9 pt, alto 57 pt, base a 30.7 pt del borde inferior             |
| Cuerpo                                       | 12 pt                                                                                   |
| Títulos (`PLAN NUTRICIONAL`, nombres de día) | 14 pt                                                                                   |
| Pie                                          | 10 pt                                                                                   |

**Paleta** (operadores `sc`/`scn` del PDF + muestreo del logo):

| Token               | Hex       | Uso                                                                           |
| ------------------- | --------- | ----------------------------------------------------------------------------- |
| `--vit-acento`      | `#5B9BD5` | títulos, nombres de día, bloque de objetivos/cantidades, reglas de la portada |
| `--vit-texto`       | `#000000` | cuerpo del plan semanal y pie                                                 |
| `--vit-logo-claro`  | `#5ECAF3` | círculo del logo                                                              |
| `--vit-logo-medio`  | `#008FD4` | ala izquierda                                                                 |
| `--vit-logo-oscuro` | `#00619D` | ala derecha y wordmark                                                        |

**Texto fijo del pie** (literal del PDF, no se genera nunca):

> Los cambios de una cita concertada deberán comunicarse con 24 horas de
> antelación, por el contrario:
>
> - Aviso previo inferior a 12h: se considerará cita realizada, por lo que se
>   cargará el importe **INTEGRO** en la siguiente cita.
> - Aviso previo entre 12-24h: se aplicará un incremento de **10€** en la
>   siguiente cita. (1/1/20)

**Defecto del original que NO se reproduce**: el cuerpo llega hasta y = 85.1 pt y el
pie ocupa de 30.7 a 87.7 pt. Se solapan 2.6 pt, y por eso en la página 3 del PDF de
referencia el pie pisa el texto de una cena. La plantilla reserva margen inferior
suficiente para el pie.

## Goals / Non-Goals

**Goals**

- Una sola plantilla como origen de la vista previa HTML y del PDF.
- Diseño, logo y pie idénticos entre dos dietas de contenido distinto.
- El PDF solo existe cuando el nutricionista aprueba.
- Ningún PDF obsoleto: un `diet_md` editado invalida el PDF guardado.

**Non-Goals**

- Igualdad byte a byte con el PDF de referencia. Es imposible: motor distinto
  (Chromium vs Quartz) y fuentes distintas (ver decisión 3). El objetivo es
  fidelidad de marca, juzgada una vez por una persona.
- Editor markdown con toolbar o WYSIWYG. Aquí solo un `textarea`.
- Backfill de las dietas anteriores al contrato.
- Plantillas alternativas por paciente o por tipo de dieta.

## Decisions

### 1. Chromium headless, no un generador de PDF nativo

**Decisión**: plantilla en HTML + CSS real, renderizada con `puppeteer-core` +
`@sparticuz/chromium`.

**Alternativa descartada — `@react-pdf/renderer`**: ~2 MB en vez de ~50 MB, sin
arranque en frío de Chromium, y con pie fijo y paginación nativos
(`<View fixed>` + `render={({ pageNumber, totalPages }) => …}`), que en Chrome
obligan a un hack. Se descarta por una razón que pesa más que todas esas: **no
sirve para la vista previa**. Con `@react-pdf` habría que maquetar el diseño dos
veces — una para el PDF y otra en HTML para la pantalla — y las dos se
desincronizarían. Una sola plantilla es el requisito que decide.

**Alternativa descartada — `pdf-lib` o dibujo por coordenadas**: rompe el requisito
de que el contenido de longitud variable fluya; obligaría a paginar a mano.

### 2. Cabecera y pie con `headerTemplate`/`footerTemplate`, y la portada en una pasada aparte

**Comprobado en un render real antes de decidir**, porque el enfoque anterior no
funciona:

- Chrome **no repite** los elementos `position: fixed` en cada página al
  imprimir. Los pinta una sola vez, donde caiga el viewport: el logo apareció al
  pie de la segunda página y el bloque de condiciones sobre el texto de la
  tercera.
- `counter(page)` y `counter(pages)` solo tienen valor dentro de las _margin
  boxes_ de `@page`. En contenido normal devuelven 0, y la paginación salió como
  "Página 0 de 0".

Así que el único mecanismo de Chrome que repite algo por página y sabe el número
de página es `headerTemplate`/`footerTemplate` de Puppeteer. Se usa ese.

Sus pegas son reales: son documentos aparte, con su propia escala, sin acceso al
CSS ni a las fuentes de la página. Se mitigan generándolos desde **las mismas
constantes** de `brand-tokens.ts` y `brand-assets.ts` que usa la plantilla, de
modo que lo que se repite es el CSS, nunca los valores. Un cambio de color o de
medida sigue tocando un solo fichero.

La **portada** no puede llevar cabecera ni pie, y Chrome no ofrece forma de
suprimirlos en la primera página. Se imprime en una segunda pasada, sin
`displayHeaderFooter`, y los dos PDF se unen con `pdf-lib`. Son dos `page.pdf()`
sobre el mismo navegador, así que el coste sobre el arranque en frío es marginal.

**Alternativa descartada — una sola pasada, con cabecera y pie también en la
portada**: no añade dependencias, pero la portada deja de parecerse al original,
que es justo el criterio de aceptación del cambio.

**Alternativa descartada — paginar a mano** (`@page { margin: 0 }` y componer
cada hoja como un bloque de 842 pt, repartiendo el contenido midiendo alturas en
el navegador): da control total y portada limpia, pero mete en nuestro código el
reparto del contenido en páginas, que es exactamente lo que el motor ya sabe
hacer, y deja la vista previa sin paginar.

**Consecuencia sobre la vista previa**: en pantalla no hay páginas, así que la
vista previa muestra la portada y el cuerpo en un flujo continuo, con la marca
una sola vez. Sigue saliendo de la misma plantilla y con el mismo CSS; lo único
que no reproduce es el corte en hojas, que no existe en un navegador.

### 3. Fuentes: clones métricamente compatibles, embebidos en base64

El original usa Times New Roman (cuerpo) y Calibri/Carlito (pie). Times New Roman y
Calibri son de Microsoft y no se pueden redistribuir en el repo ni servir desde
Vercel.

| Original        | Sustituto   | Licencia    |
| --------------- | ----------- | ----------- |
| Times New Roman | **Tinos**   | SIL OFL 1.1 |
| Calibri         | **Carlito** | SIL OFL     |

Métricamente compatibles: mismos anchos de glifo, así que los saltos de línea caen
casi donde caían. Carlito ya venía embebido en el propio PDF de referencia.

Van como `@font-face` con `src: url(data:font/woff2;base64,…)` desde una constante
TypeScript, por la regla dura 2.

**Alternativa descartada — Google Fonts o una URL absoluta del propio origen**: una
petición de red dentro del render; si tarda o falla, Chromium pagina con una fuente
de reserva y el PDF sale con otro diseño sin avisar. El render debe ser hermético.

**Alternativa descartada — fuentes del sistema**: el contenedor de
`@sparticuz/chromium` no trae ninguna fuente con serifas.

### 4. Markdown → estructura tipada → plantilla, con corte limpio

```
diet_md
   │
   ├─ frontmatter ──▶ { paciente, version, proxima_revision, calorias }
   │        └─ ausente ──▶ MODO CRUDO (markdown sin plantilla, sin PDF)
   │
   └─ cuerpo ──▶ secciones del contrato, en el orden del contrato
            ├─ presente   ──▶ bloque de plantilla correspondiente
            ├─ ausente    ──▶ se omite, sin hueco
            └─ desconocida ──▶ se ignora para la maqueta
```

Los días del plan semanal se recorren en bucle; **nunca** hay coordenadas fijas por
día. Cada bloque de día lleva `break-inside: avoid` para que un martes no se parta
entre COMIDA y MERIENDA.

Día vs turno se infiere del encabezado: `### Lunes…` es día, `### Turno …` es turno.
El frontmatter no crece para distinguirlos.

**Alternativa descartada — markdown genérico a HTML y estilar por nivel de
encabezado**: no distingue el bloque de objetivos (azul, itálica) del plan semanal
(negro, redonda) sin selectores por posición, que se rompen en cuanto el generador
añade o quita una sección.

**Alternativa descartada — plantilla estricta que falle ante lo desconocido**: las
13+ dietas ya guardadas no cumplen el contrato y dejarían de verse.

### 5. El PDF es una caché de `diet_md`, no un documento independiente

`pdf_source_hash` es un hash del `diet_md` **y de la versión de la plantilla**
(`DIET_TEMPLATE_VERSION`).

La versión va dentro por algo que pasó de verdad: un fallo del parser dejaba los
días sin comidas, se arregló, y los PDF ya guardados seguían sirviendo el
documento roto porque el markdown no había cambiado y su huella seguía
coincidiendo. Con la versión dentro, subirla invalida todos los PDF a la vez y
cada uno se rehace la próxima vez que se pide.

```
pedir PDF
   │
   ├─ pdf_path existe Y pdf_source_hash == hash(diet_md actual)
   │     └──▶ URL firmada del PDF guardado
   │
   └──▶ render ▸ subir a diets/{user}/{patient}/{consultation}.pdf
            ▸ actualizar pdf_path + pdf_source_hash ▸ URL firmada
```

Es lo contrario de "regenerar si existe": el guardado se reutiliza, y solo un
cambio del markdown fuerza un render nuevo. Una edición posterior invalida el PDF
por construcción, sin borrarlo ni coordinar nada.

**Alternativa descartada — regenerar siempre**: 3-6 s en cada descarga y un PDF que
cambia bajo los pies del paciente si la plantilla evoluciona.

**Alternativa descartada — guardar los bytes en Postgres**: un `bytea` de cientos de
KB por consulta, sin las políticas de Storage y fuera de la convención del bucket.

### 6. Storage: bucket existente, no uno nuevo

El PDF va a `diets/{user_id}/{patient_id}/{consultation_id}.pdf`, junto al `.md` de
la misma consulta. El bucket es **privado** y sus políticas ya limitan cada usuario
a su carpeta `{user_id}/…`, en espejo del RLS `created_by = auth.uid()` de las
tablas: **cero políticas nuevas**. El acceso es siempre por URL firmada de corta
duración emitida desde un route handler; nunca `getPublicUrl()`.

Lo que sí hubo que tocar, y esta decisión daba por hecho que no: la **configuración
del bucket**. Se creó con `allowed_mime_types = ['text/markdown']` y
`file_size_limit = 1 MB`, así que rechazaba cualquier PDF. Se vio al probar contra
la base real, y el síntoma era un `500` genérico al subir, no un error de permisos.
La migración `allow_pdf_in_diets_bucket` añade `application/pdf` y sube el límite a
5 MB (una dieta renderizada pesa ~250 KB con sus fuentes y su logo embebidos).

`pdf_path` guarda la **ruta**, no una URL, igual que `documento_url` hace con el
`.md`.

**Alternativa descartada — bucket `dietas-pdf`**: duplicar políticas para separar
dos ficheros de la misma consulta, y con un nombre en español que rompe la
convención del bucket existente.

### 7. El contrato entra en el bloque estático del prompt

El corte de la caché no se mueve:

```
[ instrucciones + contrato + dietas de ejemplo ]  ◀── cacheado, idéntico byte a byte
[ contexto del paciente ]
[ transcripción ]
```

El contrato del markdown y los ejemplos reescritos son contenido que **no varía
entre consultas**, así que van en el bloque estático, antes del corte, que es lo
único cacheable. Las dietas de ejemplo de `src/constants/diet-examples.ts` se
reescriben al contrato: si el ejemplo no lo cumple, el modelo tampoco lo cumplirá.

El frontmatter lleva `paciente` y `version`, que **sí** son específicos del
paciente, pero los escribe el modelo en su salida, no el prompt: no entran en el
bloque estático y no lo contaminan.

Coste aceptado: la primera generación tras el despliegue paga un fallo de caché.

### 8. `next.config.ts` se unifica

Hoy el fichero define **dos** configuraciones: un `module.exports = { experimental:
{ serverActions: { bodySizeLimit: "10mb" } } }` y un `export default nextConfig`
vacío. En un config ESM solo se lee el `export default`, así que **el límite de body
no está en vigor hoy**. Si `serverExternalPackages` se añadiera al bloque muerto,
Chromium fallaría en Vercel con un error opaco de empaquetado.

Queda un único `export default` con `serverExternalPackages: ["@sparticuz/chromium",
"puppeteer-core"]` y el límite de body.

### 9. Tres route handlers, uno por responsabilidad

| Endpoint      | Hace                             | Carga Chromium |
| ------------- | -------------------------------- | -------------- |
| vista previa  | `diet_md` → HTML de la plantilla | no             |
| `PUT` edición | reescribe `diet_md`              | no             |
| PDF           | render + subida + URL firmada    | **sí**         |

Separarlos mantiene el peso de Chromium fuera de las rutas que se usan en cada
pulsación de tecla y permite darle a la de PDF su propio `maxDuration`.

Todos son route handlers bajo `/api/*`, llamados con `fetch` (regla dura 1). No se
añaden Server Actions.

### 10. Aprobar es lo único que crea un PDF

```
Generar ──▶ diet_md guardado (borrador) ──▶ vista previa HTML
                    ▲                             │
                    │                             ▼
              PUT diet_md ◀──────────────── Modificar
                                                  │
                                                  ▼
                                              Aprobar ──▶ PDF ──▶ descarga
```

La vista previa no toca Chromium ni Storage, así que iterar sobre el texto es
barato. En el disco del usuario no queda nada salvo esa descarga final.

## Risks / Trade-offs

- **Arranque en frío de Chromium (2-5 s) sobre el render (1-3 s)** → `maxDuration`
  propio en el route de PDF. Un singleton de navegador ayuda dentro de una lambda
  caliente, pero Vercel congela o recicla la función entre invocaciones: **no** es
  una garantía y no se cuenta como mitigación. Aceptable porque solo lo paga el
  paso explícito de aprobar, no la generación ni la vista previa.
- **50 MB de dependencia** → confinados a la función de PDF; la vista previa y el
  `PUT` no importan `puppeteer-core` ni `pdf-lib`.
- **Cabecera y pie viven en un documento aparte** (limitación de Chrome, decisión 2) → se generan desde las mismas constantes de marca que la plantilla, así que
  se duplica el CSS pero nunca los valores.
- **Deriva del generador respecto al contrato** → el contrato vive en el bloque
  estático y los ejemplos se reescriben para cumplirlo; la plantilla omite lo que
  no reconoce en vez de romperse, así que una deriva degrada la maqueta pero no
  tira la página.
- **Sustitución de fuentes** → clones métricos; queda una diferencia visual mínima
  que no se puede evitar legalmente.
- **La marca evoluciona y los PDF guardados no** → se resuelve subiendo
  `DIET_TEMPLATE_VERSION`, que entra en la huella: un arreglo de la plantilla
  alcanza a los documentos ya aprobados sin tocarlos a mano. El precio es que el
  PDF que recibió el paciente puede cambiar cuando cambia la plantilla; se
  acepta, porque la alternativa es repartir documentos que se sabe que están
  mal.
- **Acceptance "idéntico al PDF de referencia" no es automatizable** → los PDF
  llevan `CreationDate` y no son deterministas byte a byte. Se verifica así: (a)
  test sobre el HTML de la plantilla, que comprueba que cabecera y pie son
  idénticos para dos dietas distintas; (b) comprobación visual manual una sola vez
  contra el PDF de referencia.

## Migration Plan

1. Migración SQL: `pdf_path text null`, `pdf_source_hash text null` en
   `patient_consultations`. Aditiva; las filas existentes quedan a `null` y por
   tanto sin PDF, que es el comportamiento acordado.
2. `next.config.ts` unificado antes de añadir las dependencias, o el despliegue
   falla de forma confusa.
3. Reescribir prompt y ejemplos al contrato. Primera generación con fallo de caché.
4. Desplegar. Las dietas anteriores siguen mostrándose en modo crudo sin tocarlas.

**Rollback**: quitar los tres endpoints y los botones. Las columnas nuevas quedan
sin usar, sin romper nada, y los PDF ya subidos quedan huérfanos en el bucket.
