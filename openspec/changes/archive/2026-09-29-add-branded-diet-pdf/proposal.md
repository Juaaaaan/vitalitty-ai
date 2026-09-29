# Proposal

## Why

La dieta se entrega hoy al paciente como markdown crudo: sin logo, sin colores,
sin el pie de condiciones de cita. El nutricionista reproduce a mano la marca en
Word antes de enviarla, y cada dieta sale ligeramente distinta.

El documento ya existe y es la fuente de verdad (arquitectura documento-primero).
Lo que falta es la **presentación**: una plantilla fija que ponga la marca y se
rellene con ese documento, para que dos dietas con contenido distinto salgan con
idéntico diseño.

## What Changes

**Contrato del markdown (fijado aquí)** — hasta ahora la estructura del documento
era "parecida a los ejemplos". Pasa a ser un contrato explícito:

```
---
paciente: <nombre>
version: <n>
proxima_revision: <fecha/hora>
calorias: <rango kcal>
---

## Objetivos
## Suplementación
## Cantidades
## Pre/Post-entreno
## Plan semanal
### Lunes[: actividad]        # o ### Turno mañana / ### Turno tarde
**COMIDA** / **MERIENDA** / **CENA**
## Observaciones
```

Sin `macros`: la arquitectura objetivo prescribe raciones y cantidades en gramos,
no gramos de macronutriente, y la dieta de referencia tampoco los lleva.

- **Plantilla de marca única** en HTML + CSS, derivada del PDF de referencia
  (`public/diets_example/SANDRA_DE_GREGORIO_5.pdf`): portada con logo, icono de
  Instagram y `@vitalittynutri`; logo repetido arriba a la derecha en el resto de
  páginas; pie fijo con las condiciones de cambio de cita, versión, fecha y
  **número de página**; tipografías y paleta de marca.
- **La misma plantilla sirve para dos salidas**: vista previa HTML en la app
  (barata, sin PDF) y PDF (render headless de esa misma plantilla). No hay dos
  maquetaciones que mantener sincronizadas.
- **Nuevo paso de aprobación en `/diets`**: generar → guardar md → previsualizar →
  _Modificar_ (editar el md y re-previsualizar) → _Aprobar_ (es el único momento
  en que se renderiza y sube un PDF).
- **Nuevo route handler para editar el documento** (`PUT`), porque hoy no existe
  forma de corregir `diet_md` salvo de pasada al subirlo.
- **Nuevo route handler de PDF**, con caché por contenido: la fila de la consulta
  guarda `pdf_path` y `pdf_source_hash`; si el hash coincide con el `diet_md`
  actual se reutiliza el PDF guardado, si no se regenera, se re-sube y se
  actualizan ambos campos.
- **Ficha de paciente**: cada consulta ofrece ver/descargar su PDF desde Storage.
  Nunca regenera ahí.
- **Compatibilidad hacia atrás**: solo las dietas nuevas usan plantilla y PDF. Las
  consultas anteriores se siguen mostrando como markdown crudo, sin PDF y sin
  backfill. La plantilla es tolerante: renderiza las secciones del contrato que
  estén presentes, en el orden del contrato, omite las ausentes, y ante un
  documento sin frontmatter cae a render crudo. No inventa estructura para
  contenido que no reconoce.
- **Sincronización con la generación**: el prompt estático y las dietas de ejemplo
  de `diet-generation` pasan a producir exactamente este contrato. Sin esto el
  generador emitiría secciones que la plantilla no espera.

Reglas duras que condicionan el cambio:

- **Regla 2 (sin filesystem)**: el logo, el icono de Instagram y las fuentes no se
  pueden leer de `public/` en runtime. Entran como constantes TypeScript
  (base64 / data URI), igual que las dietas de ejemplo.
- **Regla 1 (nada de Server Actions)**: los tres nuevos endpoints son route
  handlers bajo `/api/*` y el cliente los llama con `fetch`.

**Storage**: el PDF va al bucket **existente `diets`**, que es **privado**, en
`{user_id}/{patient_id}/{consultation_id}.pdf`, junto al `.md` de la misma
consulta. Las políticas de Storage que ya limitan cada usuario a su carpeta
`{user_id}/…` lo cubren sin cambios: **cero migraciones de bucket, cero políticas
nuevas**. El acceso es siempre por URL firmada emitida desde un route handler.
Nunca `getPublicUrl()`: son datos de salud.

## Capabilities

### New Capabilities

- `diet-document-template`: la forma visual del documento de dieta — qué secciones
  del contrato se reconocen, cómo se mapean a la plantilla de marca, qué elementos
  fijos aparecen en cada página, y el comportamiento tolerante ante documentos que
  no siguen el contrato.
- `diet-pdf-export`: el ciclo de vida del PDF — cuándo se genera (solo al aprobar),
  cómo se almacena, cuándo se reutiliza y cuándo se regenera, y cómo se entrega al
  usuario desde un bucket privado.
- `diet-document-editing`: corregir el documento de una consulta antes de
  aprobarlo, y qué efecto tiene esa corrección sobre la vista previa y sobre un PDF
  ya existente.

### Modified Capabilities

- `diet-generation`: la estructura del documento generado deja de definirse por
  semejanza con los ejemplos y pasa a ser un contrato explícito (frontmatter con
  `paciente`, `version`, `proxima_revision`, `calorias`, y un conjunto cerrado de
  secciones). Las dietas de ejemplo en contexto deben cumplirlo.

## Impact

**Código**

- `app/api/`: nuevos `diet-preview` (o render server-side de la vista previa),
  `diet-pdf`, y un `PUT` para actualizar `diet_md`.
- `app/diets/page.tsx`: pasos de vista previa, Modificar y Aprobar.
- `app/dashboard/patient/[id]/page.tsx`: ver/descargar PDF por consulta.
- `src/constants/`: plantilla de marca, tokens de color, fuentes y logo en base64,
  contrato del markdown.
- `src/constants/diet-examples.ts` y el prompt estático de
  `src/services/diet-generation-service.ts`: reescritos al contrato. **Invalida la
  caché del bloque estático** la primera vez.
- `next.config.ts`: hoy contiene **dos** configuraciones (`module.exports` y
  `export default`); en un config ESM solo gana la segunda, así que el
  `bodySizeLimit` actual no se está aplicando. Se unifica en un único
  `export default` con `serverExternalPackages` y el límite de body.

**Datos**

- Migración en `patient_consultations`: `pdf_path` y `pdf_source_hash`, ambos
  nullable. Las filas existentes quedan a `null` y por tanto sin PDF.

**Dependencias**

- `puppeteer-core` y `@sparticuz/chromium` (~50 MB descomprimido). Afecta al
  tamaño y al arranque en frío de la función que renderiza el PDF, no al resto.

**Riesgos**

- Arranque en frío de Chromium en Vercel: el route de PDF necesita su propio
  `maxDuration`. Reutilizar la instancia de navegador ayuda dentro de una lambda
  caliente, pero **no** es una garantía entre invocaciones.
- Las fuentes del PDF de referencia (Times New Roman, Calibri) son de Microsoft y
  no redistribuibles; hay que sustituirlas por clones métricamente compatibles.
