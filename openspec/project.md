# Vitalitty — contexto de proyecto

Stack: Next.js (React 19, App Router), shadcn/ui + Radix, Supabase (Postgres + Storage), Vercel.
IA: transcripción con OpenAI (gpt-4o-transcribe); generación de dieta con Claude Opus; extracción de campos para BD con Claude Haiku.

Reglas duras del proyecto:

- Los client components llaman a route handlers (/api/...) con fetch, NUNCA a Server Actions.
- Constraint de Vercel serverless: nada de readFileSync ni dependencias de filesystem; plantillas y ejemplos como constantes en el código.
- `data` y `columns` de `useReactTable` siempre con referencia estable (estado o `useMemo`). Un array nuevo en cada render provoca un bucle infinito de renders que congela la pestaña sin errores. Fue la causa real del bloqueo de `/diets`, atribuido durante un tiempo a combinar varios setState sin useTransition.
- Nunca editar a mano `src/components/ui/`: son ficheros generados por shadcn/ui.

Dirección de esta fase:

- El núcleo de generación debe funcionar como un "Proyecto" de ChatGPT/Claude: una sola pasada del modelo con ejemplos reales en contexto, no un pipeline de extracción a JSON + rellenar plantilla.
- Documento-primero: la dieta se guarda como markdown y ese markdown es la fuente de verdad. Los campos estructurados son una proyección ligera para consultar, comparar y graficar.
- Prompt de generación cacheado. Orden obligatorio: `[estático: instrucciones + dietas de ejemplo]` → `[contexto de paciente]` → `[transcripción]`. El bloque estático va primero y es el único cacheable; todo lo específico del paciente va después.
- La app aporta lo que un Proyecto NO puede: BD por paciente, histórico, comparación de dietas entre citas, gráficas.
- Separación contenido / presentación: el modelo escribe SOLO el contenido, en markdown y conforme a un contrato cerrado (frontmatter con `paciente`, `version`, `proxima_revision`, `calorias` — sin macros — y un conjunto fijo de secciones). Todo el diseño lo aporta una plantilla de marca única, que alimenta por igual la vista previa en pantalla y el PDF. El PDF de referencia se usó como especificación de diseño en desarrollo, nunca como entrada en runtime.
- El PDF es una caché del documento, no una pieza aparte: nace solo al aprobar, se guarda junto al `.md` en el bucket privado `diets`, y se reutiliza mientras su huella coincida con el `diet_md` actual. Una corrección del documento lo invalida por construcción.

Gestor de paquetes: **pnpm**. `npm install` falla en este repo (arborist revienta con el árbol de `node_modules/.pnpm`); los `npm run <script>` sí funcionan.
