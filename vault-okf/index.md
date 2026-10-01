---
id: index
type: index
title: "Cerebro Vitalitty — índice del bundle de conocimiento"
description: "Manifiesto OKF del vault: conocimiento de dominio, base científica, recetario y protocolo de comportamiento del Editor Vitalitty."
status: current
generated: 2026-10-01
---

# Cerebro Vitalitty — bundle de conocimiento (OKF)

Formato: [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog) — cada fichero es un *concepto* con frontmatter YAML (`type` obligatorio) y cuerpo markdown. Los conceptos se relacionan por el campo `related`.

> Distinción clave: hay **conocimiento** (para consultar/enriquecer la generación) y **comportamiento** (`editor-protocol`, que define cómo actúa la IA). No deben mezclarse en el mismo bloque de prompt: el conocimiento va como contexto recuperable; el protocolo va como system prompt.

## Conocimiento de dominio

- [[biblioteca-suplementacion]] — **Biblioteca Maestra de Suplementación** · `supplement-library` · stable
  Dosis, timing, evidencia y precauciones de suplementos para el Editor.
- [[recetario-maestro-141]] — **Recetario Maestro — 141 platos** · `recipe-bank` · stable
  Banco operativo de combinaciones de platos; cantidades se ajustan después.
- [[banco-platos-ampliacion-50]] — **Ampliación del Banco Maestro — 50 platos** · `recipe-bank` · stable
  50 combinaciones adicionales que complementan al recetario de 141.

## Base científica (PubMed)

- [[compendio-pubmed]] — **Compendio PubMed (01-10-2026)** · `source-compendium` · **current**
  Edición vigente. Base científica interna con PMID, hallazgo y aplicación.
- [[fuentes-cientificas-01]] — **Fuentes científicas 01 (Hipertrofia · Microbiota · Mujer)** · `source-compendium` · stable
  Subconjunto temático; su contenido ya está embebido en el compendio vigente.
- [[compendio-pubmed-2026-09-30]] — **Compendio PubMed (30-09-2026, desde Word)** · `source-compendium` · **superseded**
  Versión anterior (68 referencias), reemplazada por la del 01-10-2026. Conservada como archivo.

## Comportamiento del Editor

- [[protocolo-editor]] — **Protocolo Maestro — Editor Vitalitty (v2)** · `editor-protocol` · stable
  Identidad, extracción, perfil, auditoría, motor de restricciones clínicas, menú, gramajes, validador y formato. **Configuración, no material de consulta.**

## Notas de mantenimiento

- **Solapamiento a resolver:** `compendio-pubmed`, `fuentes-cientificas-01` y `compendio-pubmed-2026-09-30` cubren material que se repite. Para el "cerebro", usa `compendio-pubmed` como fuente viva; trata `fuentes-cientificas-01` como su subconjunto y `compendio-pubmed-2026-09-30` como archivo. Evita inyectar los tres a la vez en el prompt.
- **`recetario-maestro-141`** venía convertido de Word: se eliminó una imagen rota (`media/image1.png`). El cuerpo conserva el contenido original pero se beneficiaría de un repaso de estructura (encabezados `##` por categoría/plato) para mejorar la recuperación.
- **Fechas:** `updated` refleja la fecha indicada dentro de cada documento; `generated` es la fecha de conversión a OKF.
