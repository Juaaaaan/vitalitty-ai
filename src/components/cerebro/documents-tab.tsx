"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  // De quién son las versiones que hay en estado, por lo mismo que en la
  // pestaña de prompts: el editor se siembra al montarse.
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // El documento que el usuario quiere borrar, mientras confirma. Guardamos la
  // fila entera, no el id: el diálogo tiene que poder nombrarlo y decir cuánto
  // se lleva por delante aunque la lista se recargue debajo.
  const [pendingDelete, setPendingDelete] =
    useState<KnowledgeDocumentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      setVersionsFor(documentId);
      return;
    }

    setError(null);
    setVersions(payload.versiones);
    setVersionsFor(documentId);
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
  const confirmDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    const response = await fetch(`/api/documentos/${pendingDelete.id}`, {
      method: "DELETE",
    });
    setDeleting(false);

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "No se pudo borrar el documento.");
      return;
    }

    setError(null);
    // Si estaba abierto en la hoja, se cierra: ya no existe.
    if (selectedId === pendingDelete.id) setSelectedId(null);
    setPendingDelete(null);
    await loadDocuments();
  };

  return (
    <div className="space-y-5">
      {/* Lo primero es el número que decide el coste: lo que entra en TODAS las
          generaciones. Antes solo aparecía al pasar el umbral, y hasta entonces
          no había forma de saber por dónde ibas. */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Entra en todas las generaciones
          </p>
          <p className="text-2xl leading-none font-semibold tabular-nums">
            {alwaysIncludedSize.toLocaleString("es-ES")}
            <span className="text-muted-foreground ml-1 text-sm font-normal">
              de {ALWAYS_INCLUDED_SIZE_WARNING_CHARS.toLocaleString("es-ES")}{" "}
              caracteres recomendados
            </span>
          </p>
          <Progress
            value={Math.min(
              100,
              (alwaysIncludedSize / ALWAYS_INCLUDED_SIZE_WARNING_CHARS) * 100,
            )}
            className={
              alwaysIncludedSize > ALWAYS_INCLUDED_SIZE_WARNING_CHARS
                ? "h-1.5 w-64 [&>div]:bg-amber-500"
                : "h-1.5 w-64"
            }
          />
        </div>

        {/* La subida vive en un diálogo: es una acción de vez en cuando, y
            abierta en la página empujaba la tabla fuera de la primera pantalla. */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <UploadIcon className="mr-1 size-4" />
              Subir documento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Subir documento</DialogTitle>
              <DialogDescription>
                Solo Markdown. El documento entra en contexto cuando sus
                etiquetas cruzan con la ficha del paciente, o siempre si lo
                marcas.
              </DialogDescription>
            </DialogHeader>
            <DocumentUpload
              onUploaded={async () => {
                await loadDocuments();
                setUploadOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

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

      {/* Los filtros, pegados a la tabla que filtran, con el recuento al lado:
          antes flotaban entre el formulario de subida y la lista. */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger id="filtro-tipo" aria-label="Tipo" className="w-44">
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

        <Input
          id="filtro-tag"
          aria-label="Etiqueta"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder="Filtrar por etiqueta…"
          className="w-56"
        />

        <span className="text-muted-foreground text-sm">
          {documents.length}{" "}
          {documents.length === 1 ? "documento" : "documentos"}
        </span>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {loading && documents.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : documents.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          No hay documentos con ese filtro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead className="w-28">Tipo</TableHead>
                <TableHead className="w-24 text-right">Tamaño</TableHead>
                <TableHead className="w-16">Versión</TableHead>
                {/* Las etiquetas se esconden cuando no hay sitio: son el dato
                    que menos se lee de un vistazo —para eso está el filtro— y
                    si se quedan, el título, que es lo que identifica la fila,
                    se trunca a "Biblioteca M…". En la hoja lateral están todas. */}
                <TableHead className="hidden w-[16rem] xl:table-cell">
                  Etiquetas
                </TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => (
                <TableRow
                  key={document.id}
                  tabIndex={0}
                  role="button"
                  aria-label={document.titulo}
                  data-state={
                    document.id === selectedId ? "selected" : undefined
                  }
                  className="cursor-pointer"
                  onClick={() => setSelectedId(document.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(document.id);
                    }
                  }}
                >
                  {/* `max-w-0` + `truncate`: en una celda de tabla es lo que
                      obliga al título largo a encogerse en vez de empujar la
                      fila y desbordarse sobre lo de al lado. */}
                  <TableCell className="max-w-0 truncate font-medium">
                    <span className="flex items-center gap-2">
                      {document.siempreIncluir && (
                        <StarIcon
                          aria-label="Entra en todas las generaciones"
                          className="size-3.5 shrink-0 fill-amber-500 text-amber-500"
                        />
                      )}
                      <span className="truncate" title={document.titulo}>
                        {document.titulo}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {document.tipo}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {document.versionActiva?.tamano?.toLocaleString("es-ES") ??
                      "—"}
                  </TableCell>
                  <TableCell>
                    {document.versionActiva ? (
                      <Badge variant="outline">
                        v{document.versionActiva.version}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">sin activar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <span className="flex flex-wrap gap-1">
                      {document.tags.length === 0 && (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                      {document.tags.map((documentTag) => (
                        <Badge
                          key={documentTag}
                          variant="secondary"
                          className="font-normal"
                        >
                          {documentTag}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell>
                    {/* `stopPropagation`: la fila entera abre el documento, y
                        pulsar la papelera no debe abrirlo además de preguntar. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar ${document.titulo}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDelete(document);
                      }}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Borrar no tiene vuelta atrás: no hay papelera y el histórico se va con
          el documento, así que el diálogo lo nombra y dice qué se lleva. */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Borrar «{pendingDelete?.titulo}»</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Se borra el documento y su histórico entero
                  {pendingDelete?.versionActiva
                    ? ` (${pendingDelete.versionActiva.version} ${pendingDelete.versionActiva.version === 1 ? "versión" : "versiones"})`
                    : ""}
                  . No hay papelera: esto no se puede deshacer.
                </p>
                {pendingDelete?.siempreIncluir && (
                  <p className="text-amber-700 dark:text-amber-400">
                    Entra en todas las generaciones, así que dejará de hacerlo a
                    partir de la siguiente.
                  </p>
                )}
                <p>
                  Las dietas ya generadas no cambian: su conocimiento quedó
                  escrito dentro de cada documento.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Borrando…" : "Borrar definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* El editor en una hoja lateral: así tiene la altura entera de la
          pantalla para un documento de 39.506 caracteres, y la tabla no pierde
          ancho por un panel que la mayor parte del tiempo está vacío. */}
      <Sheet
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto p-6 sm:max-w-3xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{selected?.titulo ?? "Documento"}</SheetTitle>
          </SheetHeader>

          {selected && versionsFor === selected.id ? (
            <VersionedEditor
              key={`${selected.id}:${activeVersionId ?? "sin-activa"}`}
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

                <div className="min-w-48 flex-1 space-y-1">
                  <Label htmlFor="meta-tags">Etiquetas</Label>
                  <Input
                    id="meta-tags"
                    defaultValue={selected.tags.join(", ")}
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
              Cargando el documento…
            </p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
