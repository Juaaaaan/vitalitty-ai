# Vitalitty — contexto de proyecto

Stack: Next.js (React 19, App Router), shadcn/ui + Radix, Supabase (Postgres + Storage), Vercel.
IA: transcripción con OpenAI (gpt-4o-transcribe); generación de dieta con Claude Opus; extracción de campos para BD con Claude Haiku.

Reglas duras del proyecto:

- Los client components llaman a route handlers (/api/...) con fetch, NUNCA a Server Actions.
- Constraint de Vercel serverless: nada de readFileSync ni dependencias de filesystem; plantillas y ejemplos como constantes en el código.
- React 19 + App Router: no combinar varios setState en el mismo handler sin useTransition (congela la UI sin errores).
- Nunca editar a mano `src/components/ui/`: son ficheros generados por shadcn/ui.

Dirección de esta fase:

- El núcleo de generación debe funcionar como un "Proyecto" de ChatGPT/Claude: una sola pasada del modelo con ejemplos reales en contexto, no un pipeline de extracción a JSON + rellenar plantilla.
- Documento-primero: la dieta se guarda como markdown y ese markdown es la fuente de verdad. Los campos estructurados son una proyección ligera para consultar, comparar y graficar.
- Prompt de generación cacheado. Orden obligatorio: `[estático: instrucciones + dietas de ejemplo]` → `[contexto de paciente]` → `[transcripción]`. El bloque estático va primero y es el único cacheable; todo lo específico del paciente va después.
- La app aporta lo que un Proyecto NO puede: BD por paciente, histórico, comparación de dietas entre citas, gráficas.
