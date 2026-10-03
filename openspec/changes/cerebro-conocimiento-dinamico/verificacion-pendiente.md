# Verificación pendiente

Lo que falta para cerrar el change, y por qué no se pudo hacer desde aquí. El
código está completo y con tests; lo que queda necesita una base de datos real y
una sesión en el navegador.

Estado al 2026-10-03, rama `cerebro-conocimiento-dinamico`.

## Hecho y verificado automáticamente

- `npm run lint`: 0 errores (5 avisos, todos previos al change).
- `npx tsc --noEmit`: limpio.
- `npx vitest run`: **410 tests en 41 ficheros**, todos en verde. Incluye 15 de
  los endpoints de prompts, 16 de los de documentos, 16 del retrieval, 13 del
  bloque estático y 9 de la UI del Cerebro.
- `npm run build`: compila y publica las 7 rutas nuevas y `/cerebro`.
- **Igualdad byte a byte**: `src/services/__tests__/fixtures/static-prompt-block.before.txt`
  guarda el bloque estático tal y como lo producía el código antes del change, y
  `static-prompt-block.test.ts` comprueba que el prompt sembrado compone
  exactamente ese texto. Es lo que hace válida la semilla.

## ✅ 1. Migración aplicada y verificada (tareas 1.1–1.4)

Aplicada al proyecto `vitalitty-ai` (`apijxjakeffswxpiresl`) el 2026-10-03, con
autorización explícita, después de que la rama de Supabase resultara imposible:
`Branching is supported only on the Pro plan or above`.

Comprobado sobre la base de datos real:

| Tarea     | Resultado                                                                                                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 / 1.2 | Las cuatro tablas existen con sus FK cruzadas (`version_activa_id` → tabla de versiones, y la versión → su cabecera).                                                                                                                                                                  |
| 1.3       | Las tablas de versiones tienen **solo** `INSERT` y `SELECT`; las cabeceras, `INSERT`, `SELECT` y `UPDATE`. Como usuario autenticado: ve 1 de sus filas, 0 de las de otro `sub`, y un `update` sobre una versión propia afecta a **0 filas**.                                           |
| 1.4       | Tres inserciones seguidas sobre el mismo padre dieron `version` 1, 2 y 3; una inserción con `version = 2` explícita fue rechazada por el índice único. La serialización de dos inserciones concurrentes descansa en el mismo `pg_advisory_xact_lock` que ya usa `assign_diet_version`. |

Las pruebas corrieron dentro de un bloque que termina lanzando una excepción, así
que se deshicieron solas: las cuatro tablas quedaron a 0 filas y las 27 consultas
existentes intactas. Los advisors de seguridad no señalan ninguna de las tablas
nuevas (sus dos avisos son previos: `update_updated_at_column` sin `search_path`
y la protección de contraseñas filtradas de Auth).

**Rollback**, si alguna vez hace falta:

```sql
drop table public.documento_versiones, public.documentos_conocimiento,
           public.prompt_versiones, public.prompts cascade;
drop type public.knowledge_document_type;
```

## ✅ 2. Prompt sembrado (tarea 2.2)

`.env.local` no tiene `SUPABASE_SERVICE_ROLE_KEY`, así que `scripts/seed-prompts.ts`
no se pudo ejecutar; se sembró por SQL con la misma comprobación que hace el
script. La versión 1 de `generacion-dieta` está activa y su contenido mide **5846
caracteres con md5 `cd53639453541f910ccd0ce1d0a274b9`, idéntico al de la constante
`DEFAULT_PROMPTS`**. Leído luego con la forma exacta de `readActivePrompt`, como
usuario autenticado: mismo md5 y marcador del contrato presente.

`SUPABASE_SERVICE_ROLE_KEY` se añadió a `.env.local` después, y el script se
ejecutó en seco contra la base de datos real:

```
· generacion-dieta: already seeded, left untouched
Dry run, nothing written.
```

Es decir, es idempotente: reconoce lo ya sembrado y no duplica. Para re-sembrar
hace falta `--force`, que añade una versión nueva y la activa, sin tocar la v1.

## ~~1. Aplicar la migración~~ (hecho, ver arriba)

No se aplicó: el repo no trae `supabase/config.toml`, así que no hay stack local
que levantar, y la creación de una rama de Supabase para probarla ahí quedó
denegada. Opciones, en orden de menor riesgo:

```bash
# a) con el CLI de Supabase, contra una rama o un proyecto de pruebas
supabase link --project-ref <ref>
supabase db push

# b) aplicando el fichero tal cual al proyecto
#    supabase/migrations/20261003120000_create_brain_prompts_and_documents.sql
```

La migración es **aditiva**: crea el enum `knowledge_document_type`, las cuatro
tablas, sus índices, dos triggers de versión y sus políticas RLS. No altera
`patients` ni `patient_consultations`. Deshacerla es un `drop` manual de esas
cinco cosas.

Qué comprobar después:

| Tarea     | Comprobación                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 / 1.2 | Las cuatro tablas existen con sus FK, y `version_activa_id` apunta a su tabla de versiones.                                                                             |
| 1.3       | Con dos usuarios: ninguno ve las filas del otro, y un `update` sobre una fila de `prompt_versiones` o `documento_versiones` es rechazado (no hay política de `UPDATE`). |
| 1.4       | Dos inserciones concurrentes sobre el mismo padre no repiten `version` (el `pg_advisory_xact_lock` las serializa).                                                      |

`npm run build` ya cubre la parte de 1.5 que aplica; **no hay tipos de Supabase
que regenerar**: este repo no tiene fichero de tipos generados y el cliente se
usa sin tipar.

## ~~2. Sembrar los prompts~~ (hecho, ver arriba)

```bash
SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
  scripts/seed-prompts.ts --user <tu auth user id> --dry-run   # primero en seco
SUPABASE_SERVICE_ROLE_KEY=... node --no-warnings --env-file=.env.local \
  scripts/seed-prompts.ts --user <tu auth user id>
```

El script lee el contenido de `DEFAULT_PROMPTS` —no una copia pegada— y, tras
insertar, vuelve a leer de la base de datos y aborta si lo guardado no coincide
carácter a carácter con la constante. Si imprime `✓ generacion-dieta: v1 active
… identical to the constant`, la tarea 2.2 está verificada.

## 3. Cargar el vault (tarea 9.2) — en espera, a propósito

**Decidido el 2026-10-03: la carga espera a que la comprobación 10.1 esté hecha.**
En cuanto el vault entre, las dietas cambian — el protocolo del editor está
planeado como "siempre incluir" (39.506 caracteres en toda generación) y los
demás entran en cuanto sus etiquetas (`hipertrofia`, `microbiota`, `pms`…) cruzan
con la ficha del paciente. Cargarlo antes de 10.1 destruiría la referencia limpia
de "una dieta como las de hoy".

Orden acordado:

1. Generar una dieta en `/diets` con solo el prompt sembrado y 0 documentos, y
   confirmar que sale equivalente a las de siempre (10.1).
2. Arreglar el recetario de 141 platos según `vault-review.md`.
3. Cargar: `node --no-warnings --env-file=.env.local scripts/load-vault.ts --user <id>`.
4. Generar otra vez y ver el efecto del conocimiento.

La prueba en seco ya corrió contra la base de datos real y hace lo previsto:

```
· Biblioteca_Maestra_Suplementacion_Vitalitty_v1.md: would load … (suplementacion, 21894 chars)
· COMPENDIO_PUBMED_VITALITTY_01-10-2026.md: would load … (paper, 50546 chars)
· Fuentes_cientificas_Vitalitty_01_Hipertrofia_Microbiota_Mujer.md: would load … (paper, 21870 chars)
· PROTOCOLO_MAESTRO_PROMPTS_EDITOR_VITALITTY_v2_01-10-2026.md: would load … (protocolo, always included, 39506 chars)
· VITALITTY_Ampliacion_Banco_Maestro_50_Platos.md: would load … (recetario, 11547 chars)
✗ VITALITTY_Recetario_Maestro_141_Platos.md: no markdown headings; carries an <img> tag; HTML tables instead of markdown. Clean it up or re-run with --force.
· index.md: empty, skipped
```

Un detalle cosmético: los títulos salen del nombre del fichero, así que quedan
como "COMPENDIO PUBMED VITALITTY 01 10 2026". Se pueden reescribir desde
`/cerebro` sin crear versión, porque el título es metadata.

## 4. Comprobaciones en navegador (tareas 7.x, 8.x, 10.x)

Con la migración aplicada y los prompts sembrados, `npm run dev` y:

1. **7.1 / 7.2** — Abre `/cerebro` (está en la barra lateral, "Cerebro →
   Prompts y documentación"). Debe cargar, cambiar entre las dos pestañas, y
   mostrar "Generación de dieta" con su versión activa marcada `v1`.
2. **7.3** — Edita el texto y pulsa **Guardar**. Debe aparecer "Guardado como
   versión nueva. No está activa todavía", y la insignia de versión activa debe
   seguir en `v1`. Recarga: el histórico tiene `v2` y la activa sigue siendo
   `v1`. Pulsa **Activar** en la `v2` y recarga: ahora la activa es `v2`.
3. **7.4** — En el histórico, **Ver cambios** de la `v2` enseña el diff contra
   la `v1`. **Restaurar** la `v1` carga su texto en el editor sin tocar nada;
   al guardar aparece una `v3` y el histórico mantiene `v1` y `v2` intactas.
4. **7.5** — No aplica tal cual: ningún listado del Cerebro usa TanStack Table
   (son listas de botones), así que no hay `data`/`columns` que memoizar. Lo que
   sí conviene mirar es que la pestaña no se congela al abrir ni al filtrar.
5. **8.1** — Pestaña Documentación: suelta un `.pdf` en la zona de arrastre.
   Debe salir "Sube el documento en formato Markdown (.md)." y **no** debe
   haber ninguna petición en la pestaña de red. Repite con un `.md`: se lee y
   rellena el título.
6. **8.2** — Sube un `.md` con tipo y etiquetas. Aparece en el listado con su
   metadata y responde a los filtros de tipo y etiqueta.
7. **8.3** — Sobre ese documento, el mismo ciclo que en 7.3 y 7.4.
8. **8.4** — Marca documentos como "incluir en todas las generaciones" hasta
   pasar de 120.000 caracteres (el umbral de `ALWAYS_INCLUDED_SIZE_WARNING_CHARS`,
   fijado sobre los 181.660 del vault). Debe salir el aviso ámbar y la acción
   completarse igual.
9. **10.1** — Genera una dieta en `/diets` sin haber tocado nada del Cerebro. El
   documento debe salir equivalente al de siempre y su vista previa reconocerse
   como estructurada (no en modo crudo).
10. **10.2** — Activa una versión nueva del prompt con un cambio visible (por
    ejemplo, pedir una línea más en Observaciones), genera otra dieta **sin
    redesplegar** y comprueba que el cambio aparece.
11. **10.3** — Con la tabla de documentos vacía, genera: debe funcionar. Luego
    fuerza un fallo (renombra temporalmente la tabla, o corta la red a Supabase
    tras el login) y comprueba que la consulta termina con su dieta guardada y
    que en el log del servidor sale `Generating with the code defaults:`.
12. **6.5 / 10.4** — En la consola del servidor, cada generación imprime
    `Diet generation usage:` con `cacheReadInputTokens`. En dos generaciones
    consecutivas sin tocar el Cerebro, la segunda debe traer un valor alto. Tras
    activar una versión, la primera generación posterior debe traer
    `cacheReadInputTokens: 0` y `cacheCreationInputTokens` alto; la siguiente,
    otra vez cache-hit. Anota también el tiempo total frente a los 59,6 s del
    peor caso conocido, que es lo que dice cuánto margen come el retrieval.
