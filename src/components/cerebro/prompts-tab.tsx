"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VersionedEditor } from "@/components/cerebro/versioned-editor";
import type {
  BrainVersionWithContent,
  PromptSummary,
} from "@/models/brain/brain.models";

/**
 * Prompts del sistema, agrupados por tipo, con su versión activa marcada.
 *
 * Todo pasa por `fetch` contra `/api/prompts/*`: sin Server Actions.
 */
export function PromptsTab() {
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<BrainVersionWithContent[]>([]);
  // De quién son las versiones que hay en estado. El editor se siembra de su
  // versión activa al montarse, así que montarlo antes de que lleguen —o con
  // las del prompt anterior— lo deja vacío o con el contenido equivocado.
  const [versionsFor, setVersionsFor] = useState<string | null>(null);

  // La identidad de la versión activa sale de `versions`, no del listado: el
  // editor se siembra de `versions`, así que remontarlo con lo que dice el
  // listado lo remonta antes de tiempo. Al activar una versión, el listado se
  // refresca primero y las versiones después; con la key del listado el editor
  // se quedaba con el contenido de la versión anterior mientras el subtítulo ya
  // anunciaba el tamaño de la nueva, y guardar encima habría creado una versión
  // con el contenido viejo.
  const activeVersionId = (
    versions.find((version) => version.activa) ?? versions[0]
  )?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPrompts = useCallback(async () => {
    // Sin `setState` antes del primer `await`: llamada desde un efecto, un
    // cambio de estado síncrono aquí encadenaría renders.
    const response = await fetch("/api/prompts");
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error ?? "No se pudieron cargar los prompts.");
      return;
    }

    setError(null);
    setPrompts(payload.prompts);
    setSelectedId((current) => current ?? payload.prompts[0]?.id ?? null);
  }, []);

  const loadVersions = useCallback(async (promptId: string) => {
    const response = await fetch(`/api/prompts/${promptId}/versiones`);
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "No se pudo cargar el histórico.");
      setVersions([]);
      setVersionsFor(promptId);
      return;
    }

    setError(null);
    setVersions(payload.versiones);
    setVersionsFor(promptId);
  }, []);

  useEffect(() => {
    // La carga vive en una promesa, no en el cuerpo del efecto: así el
    // `setState` ocurre en un callback y no encadena renders.
    void Promise.resolve().then(() => loadPrompts());
  }, [loadPrompts]);

  useEffect(() => {
    if (!selectedId) return;
    void Promise.resolve().then(() => loadVersions(selectedId));
  }, [selectedId, loadVersions]);

  const grouped = useMemo(() => {
    const byType = new Map<string, PromptSummary[]>();
    for (const prompt of prompts) {
      byType.set(prompt.tipo, [...(byType.get(prompt.tipo) ?? []), prompt]);
    }
    return [...byType.entries()];
  }, [prompts]);

  const selected = prompts.find((prompt) => prompt.id === selectedId) ?? null;

  const save = async (contenido: string, notaCambio: string) => {
    const response = await fetch(`/api/prompts/${selectedId}/versiones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido, notaCambio }),
    });
    const payload = await response.json();

    if (!response.ok) return payload.error ?? "No se pudo guardar.";

    await loadVersions(selectedId!);
    return null;
  };

  const activate = async (versionId: string) => {
    const response = await fetch(`/api/prompts/${selectedId}/activar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    const payload = await response.json();

    if (!response.ok) return payload.error ?? "No se pudo activar la versión.";

    await Promise.all([loadPrompts(), loadVersions(selectedId!)]);
    return null;
  };

  if (loading && prompts.length === 0) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Selector arriba, no columna lateral: hoy hay un solo prompt y una
          columna de 18rem para una fila deja el editor estrecho sin ganar nada.
          Con varios, esto crece a una fila de botones sin cambiar el editor. */}
      <nav aria-label="Prompts" className="flex flex-wrap items-center gap-2">
        {grouped.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No hay prompts todavía. Se siembran con{" "}
            <code>scripts/seed-prompts.ts</code>; mientras no existan, la
            generación usa los del código.
          </p>
        )}

        {grouped.map(([tipo, group]) => (
          <div key={tipo} className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[0.7rem] font-semibold tracking-wide uppercase">
              {tipo}
            </span>
            {group.map((prompt) => (
              <Button
                key={prompt.id}
                size="sm"
                variant={prompt.id === selectedId ? "secondary" : "ghost"}
                className="max-w-[20rem] justify-between gap-2"
                onClick={() => setSelectedId(prompt.id)}
              >
                <span className="truncate">{prompt.nombre}</span>
                {prompt.versionActiva ? (
                  <Badge variant="outline" className="shrink-0">
                    v{prompt.versionActiva.version}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="shrink-0">
                    sin activar
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        ))}
      </nav>

      <section>
        {error && <p className="text-destructive mb-3 text-sm">{error}</p>}

        {selected && versionsFor === selected.id ? (
          <VersionedEditor
            // Remontar al cambiar de prompt o de versión activa: así el editor
            // arranca del contenido vigente sin sincronizar estado en un efecto.
            key={`${selected.id}:${activeVersionId ?? "sin-activa"}`}
            titulo={selected.nombre}
            subtitulo={
              selected.versionActiva?.activadaEn
                ? `Activa desde ${new Date(selected.versionActiva.activadaEn).toLocaleString("es-ES")}`
                : "Este prompt no tiene versión activa: la generación usa el del código."
            }
            versiones={versions}
            onSave={save}
            onActivate={activate}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {selected
              ? "Cargando el prompt…"
              : "Elige un prompt para editarlo."}
          </p>
        )}
      </section>
    </div>
  );
}
