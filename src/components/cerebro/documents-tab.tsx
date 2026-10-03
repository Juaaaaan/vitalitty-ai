"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VersionedEditor } from "@/components/cerebro/versioned-editor";
import { DocumentUpload } from "@/components/cerebro/document-upload";
import {
  KNOWLEDGE_DOCUMENT_TYPES,
  type BrainVersionWithContent,
  type KnowledgeDocumentSummary,
  type KnowledgeDocumentType,
} from "@/models/brain/brain.models";
import { ALWAYS_INCLUDED_SIZE_WARNING_CHARS } from "@/constants/brain";

const ALL = "todos";

/**
 * Documentación de conocimiento: subida en `.md`, listado filtrable y el mismo
 * editor versionado que los prompts.
 */
export function DocumentsTab() {
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<BrainVersionWithContent[]>([]);
  const [tipo, setTipo] = useState<string>(ALL);
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    const query = new URLSearchParams();
    if (tipo !== ALL) query.set("tipo", tipo);
    if (tag.trim()) query.set("tag", tag.trim());

    // Igual que en la pestaña de prompts: nada de `setState` síncrono antes
    // del primer `await`, porque esto se llama desde un efecto.
    const response = await fetch(`/api/documentos?${query.toString()}`);
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.error ?? "No se pudieron cargar los documentos.");
      return;
    }

    setError(null);
    setDocuments(payload.documentos);
  }, [tipo, tag]);

  const loadVersions = useCallback(async (documentId: string) => {
    const response = await fetch(`/api/documentos/${documentId}/versiones`);
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "No se pudo cargar el histórico.");
      setVersions([]);
      return;
    }

    setError(null);
    setVersions(payload.versiones);
  }, []);

  useEffect(() => {
    // Igual que arriba: el `setState` ocurre dentro de la promesa.
    void Promise.resolve().then(() => loadDocuments());
  }, [loadDocuments]);

  useEffect(() => {
    if (!selectedId) return;
    void Promise.resolve().then(() => loadVersions(selectedId));
  }, [selectedId, loadVersions]);

  const selected =
    documents.find((document) => document.id === selectedId) ?? null;

  /**
   * Tamaño del conjunto que entra en TODAS las generaciones. Pasado el umbral
   * se avisa: ese conjunto encarece la llamada en frío posterior a cada cambio
   * en el Cerebro. Es un aviso, no un bloqueo.
   */
  const alwaysIncludedSize = useMemo(
    () =>
      documents
        .filter((document) => document.siempreIncluir)
        .reduce(
          (total, document) => total + (document.versionActiva?.tamano ?? 0),
          0,
        ),
    [documents],
  );

  const save = async (contenidoMd: string, notaCambio: string) => {
    const response = await fetch(`/api/documentos/${selectedId}/versiones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenidoMd, notaCambio }),
    });
    const payload = await response.json();

    if (!response.ok) return payload.error ?? "No se pudo guardar.";

    await loadVersions(selectedId!);
    return null;
  };

  const activate = async (versionId: string) => {
    const response = await fetch(`/api/documentos/${selectedId}/activar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    const payload = await response.json();

    if (!response.ok) return payload.error ?? "No se pudo activar la versión.";

    await Promise.all([loadDocuments(), loadVersions(selectedId!)]);
    return null;
  };

  const patchMetadata = async (changes: Record<string, unknown>) => {
    const response = await fetch(`/api/documentos/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "No se pudo guardar la metadata.");
      return;
    }

    await loadDocuments();
  };

  return (
    <div className="space-y-6">
      <DocumentUpload onUploaded={loadDocuments} />

      {alwaysIncludedSize > ALWAYS_INCLUDED_SIZE_WARNING_CHARS && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            El conjunto marcado para incluir en todas las generaciones ocupa{" "}
            {alwaysIncludedSize.toLocaleString("es-ES")} caracteres. Entra
            entero en cada dieta, así que encarece la primera generación
            posterior a cada cambio en el Cerebro. Considera dejar
            incondicionales solo los protocolos y etiquetar el resto.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="filtro-tipo">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger id="filtro-tipo" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {KNOWLEDGE_DOCUMENT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="filtro-tag">Etiqueta</Label>
          <Input
            id="filtro-tag"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="celiaquia"
            className="w-48"
          />
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <nav aria-label="Documentos" className="space-y-1">
          {loading && documents.length === 0 && (
            <Skeleton className="h-40 w-full" />
          )}

          {!loading && documents.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No hay documentos con ese filtro.
            </p>
          )}

          {documents.map((document) => (
            <Button
              key={document.id}
              variant={document.id === selectedId ? "secondary" : "ghost"}
              className="h-auto w-full flex-col items-start gap-1 py-2"
              onClick={() => setSelectedId(document.id)}
            >
              <span className="truncate font-medium">{document.titulo}</span>
              <span className="flex flex-wrap gap-1">
                <Badge variant="outline">{document.tipo}</Badge>
                {document.siempreIncluir && (
                  <Badge variant="secondary">siempre</Badge>
                )}
                {document.versionActiva ? (
                  <Badge variant="outline">
                    v{document.versionActiva.version}
                  </Badge>
                ) : (
                  <Badge variant="destructive">sin activar</Badge>
                )}
                {document.tags.map((documentTag) => (
                  <Badge key={documentTag} variant="outline">
                    {documentTag}
                  </Badge>
                ))}
              </span>
            </Button>
          ))}
        </nav>

        <section>
          {selected ? (
            <VersionedEditor
              key={`${selected.id}:${selected.versionActiva?.id ?? "sin-activa"}`}
              titulo={selected.titulo}
              subtitulo={`${selected.tipo} · ${selected.versionActiva?.tamano?.toLocaleString("es-ES") ?? 0} caracteres`}
              versiones={versions}
              onSave={save}
              onActivate={activate}
            >
              <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <Label htmlFor="meta-tipo">Tipo</Label>
                  <Select
                    value={selected.tipo}
                    onValueChange={(value) =>
                      patchMetadata({ tipo: value as KnowledgeDocumentType })
                    }
                  >
                    <SelectTrigger id="meta-tipo" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWLEDGE_DOCUMENT_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="meta-tags">Etiquetas</Label>
                  <Input
                    id="meta-tags"
                    defaultValue={selected.tags.join(", ")}
                    className="w-64"
                    onBlur={(event) =>
                      patchMetadata({
                        tags: event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter((value) => value.length > 0),
                      })
                    }
                  />
                </div>

                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    id="meta-siempre"
                    checked={selected.siempreIncluir}
                    onCheckedChange={(checked) =>
                      patchMetadata({ siempreIncluir: checked })
                    }
                  />
                  <Label htmlFor="meta-siempre">
                    Incluir en todas las generaciones
                  </Label>
                </div>

                <p className="text-muted-foreground w-full text-xs">
                  Cambiar la metadata no crea una versión: describe el
                  documento, no es su contenido.
                </p>
              </div>
            </VersionedEditor>
          ) : (
            <p className="text-muted-foreground text-sm">
              Elige un documento para ver su contenido y su histórico.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
