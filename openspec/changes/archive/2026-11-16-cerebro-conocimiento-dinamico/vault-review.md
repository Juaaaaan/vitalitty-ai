# Revisión del vault antes de cargarlo

Qué hay hoy en `vault/` y qué conviene corregir **antes** de cargarlo en
`documentos_conocimiento`. Lo que entra aquí entra en el contexto de las dietas,
así que lo que esté sucio se arrastra a producción.

Medido el 2026-10-03 sobre la rama `cerebro-conocimiento-dinamico`.

| Fichero                                                         | Tamaño | Estado    | Tipo propuesto   |
| --------------------------------------------------------------- | ------ | --------- | ---------------- |
| `PROTOCOLO_MAESTRO_PROMPTS_EDITOR_VITALITTY_v2_01-10-2026`      | 40.550 | limpio    | `protocolo`      |
| `COMPENDIO_PUBMED_VITALITTY_01-10-2026`                         | 51.783 | limpio    | `paper`          |
| `Fuentes_cientificas_Vitalitty_01_Hipertrofia_Microbiota_Mujer` | 22.336 | limpio    | `paper`          |
| `Biblioteca_Maestra_Suplementacion_Vitalitty_v1`                | 22.462 | limpio    | `suplementacion` |
| `VITALITTY_Ampliacion_Banco_Maestro_50_Platos`                  | 11.814 | limpio    | `recetario`      |
| `VITALITTY_Recetario_Maestro_141_Platos`                        | 32.715 | **sucio** | `recetario`      |
| `index.md`                                                      | 0      | **vacío** | —                |

Total con contenido: 181.660 caracteres. El mayor es el compendio de PubMed.

## ✅ Corregido el 2026-11-14

El recetario de 141 platos ya está limpio y los seis ficheros con contenido
pasan la validación de `scripts/load-vault.ts` (dry run sin ningún `✗`):

| Antes                                    | Después                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0 encabezados markdown                   | 17: `#` del banco, `##` por sección y `###` en las cajas de temporada                             |
| `<img src="media/image1.png">`           | borrado                                                                                           |
| 2 tablas HTML (`<table>`, `<th>`, `<p>`) | listas de viñetas con su `###`; 0 etiquetas HTML en todo el fichero                               |
| viñetas dentro de `>` y numeración `1\.` | listas markdown normales                                                                          |
| 32.715 caracteres                        | 32.233 bytes / 31.699 caracteres (el marcado HTML fuera, el relleno de tablas de prettier dentro) |

Las **171 filas de tabla markdown se conservan intactas** (141 platos + 8 de la
matriz de sustituciones + cabeceras), y el contenido se comprobó comparando el
multiset de palabras del fichero antes y después: **idéntico, mismas palabras y
mismas repeticiones**. Solo cambió el marcado.

Queda un detalle cosmético, a propósito: los títulos siguen saliendo del nombre
del fichero ("COMPENDIO PUBMED VITALITTY 01 10 2026"). El título es metadata, así
que se reescribe desde `/cerebro` sin crear versión de contenido.

## Lo que había que corregir

1. **`VITALITTY_Recetario_Maestro_141_Platos.md` salió mal de la conversión
   desde Word.** Tres defectos concretos:
   - **no tiene ni un encabezado markdown** (`grep -c '^#'` da 0): el banco de
     141 platos es un muro de texto sin estructura, así que el modelo no puede
     distinguir bloques ni categorías. Es el defecto que más importa: un
     documento sin jerarquía entra en contexto como ruido;
   - **arrastra una imagen que no existe**: `<img src="media/image1.png">` en la
     primera línea, y `vault/media/` no está en el repo. Hay que borrar la línea;
   - **las tablas son HTML crudo** (`<table>`, `<colgroup>`, `<thead>`, `<tr>`,
     `<th>`, `<p>`), no markdown. Funcionan como texto, pero ocupan tokens en
     etiquetas en lugar de en contenido.

   Antes de cargarlo: quitar el `<img>`, convertir las dos tablas a markdown y
   darle encabezados por categoría de plato (`## Carnes`, `## Pescados`…), que
   es lo que permite al retrieval y al modelo citar un bloque concreto.

2. **`index.md` está vacío.** No se carga: la base de datos rechaza el contenido
   en blanco por `check`, y un documento sin contenido no aportaría nada. Si era
   un índice del bundle, se regenera después o se descarta.

## Decisiones de carga

- **Ninguno se marca "siempre incluir" de entrada**, salvo el protocolo del
  editor. Los demás van etiquetados: el compendio y las fuentes por patología
  (`hipertrofia`, `microbiota`, `pms`), la biblioteca por `suplementacion`, los
  recetarios por `platos`. Marcarlos todos incondicionales metería 181.660
  caracteres en cada dieta y dispararía el aviso de tamaño del Cerebro.
- La carga la hace `scripts/load-vault.ts`, que **se niega a subir un fichero
  sucio** salvo con `--force`, para que este repaso no se pueda olvidar.
