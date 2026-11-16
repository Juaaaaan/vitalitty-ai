"use client";

import { useRef, useState, type DragEvent } from "react";
import { UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KNOWLEDGE_DOCUMENT_TYPES,
  type KnowledgeDocumentType,
} from "@/models/brain/brain.models";
import { MARKDOWN_EXTENSION, ONLY_MARKDOWN_MESSAGE } from "@/constants/brain";

/**
 * Subida de un documento de conocimiento.
 *
 * Solo acepta `.md`, y lo rechaza **antes de subir nada**: el usuario tiene la
 * respuesta al instante y un `.pdf` grande no viaja para nada. El servidor
 * revalida igualmente, porque una petición puede llegar sin pasar por aquí.
 * Ningún formato se convierte: eso es otro cambio.
 */
export function DocumentUpload({
  onUploaded,
}: {
  onUploaded: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<KnowledgeDocumentType>("otro");
  const [tags, setTags] = useState("");
  const [siempreIncluir, setSiempreIncluir] = useState(false);
  const [contenido, setContenido] = useState("");
  const [nombreFichero, setNombreFichero] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const takeFile = async (file: File) => {
    setNotice(null);

    if (!file.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
      setError(ONLY_MARKDOWN_MESSAGE);
      setContenido("");
      setNombreFichero("");
      return;
    }

    setError(null);
    setNombreFichero(file.name);
    setContenido(await file.text());
    if (titulo.trim().length === 0) {
      setTitulo(file.name.replace(/\.md$/i, "").replace(/[_-]+/g, " "));
    }
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) await takeFile(file);
  };

  const upload = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/documentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo,
        tipo,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        siempreIncluir,
        contenidoMd: contenido,
        nombreFichero,
      }),
    });
    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "No se pudo subir el documento.");
      return;
    }

    setNotice(`Subido como v1 y activado: ${titulo}`);
    setTitulo("");
    setTags("");
    setContenido("");
    setNombreFichero("");
    setSiempreIncluir(false);
    if (inputRef.current) inputRef.current.value = "";
    await onUploaded();
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center text-sm ${
          dragging ? "border-primary bg-primary/5" : "text-muted-foreground"
        }`}
      >
        <UploadIcon className="size-5" />
        <p>
          Arrastra aquí el documento en Markdown, o
          <Button
            variant="link"
            className="px-1"
            onClick={() => inputRef.current?.click()}
          >
            adjúntalo
          </Button>
        </p>
        <p className="text-xs">Solo se admite {MARKDOWN_EXTENSION}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".md,text/markdown"
          className="hidden"
          aria-label="Adjuntar documento Markdown"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) await takeFile(file);
          }}
        />
        {nombreFichero && (
          <p className="text-foreground text-xs">
            {nombreFichero} · {contenido.length} caracteres
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="documento-titulo">Título</Label>
          <Input
            id="documento-titulo"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            placeholder="Biblioteca de suplementación"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="documento-tipo">Tipo</Label>
          <Select
            value={tipo}
            onValueChange={(value) => setTipo(value as KnowledgeDocumentType)}
          >
            <SelectTrigger id="documento-tipo">
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
          <Label htmlFor="documento-tags">Etiquetas</Label>
          <Input
            id="documento-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="celiaquia, gluten"
          />
          <p className="text-muted-foreground text-xs">
            Separadas por comas. Son lo que cruza el documento con el perfil del
            paciente.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-6">
          <Switch
            id="documento-siempre"
            checked={siempreIncluir}
            onCheckedChange={setSiempreIncluir}
          />
          <Label htmlFor="documento-siempre">
            Incluir en todas las generaciones
          </Label>
        </div>
      </div>

      <Button
        disabled={busy || contenido.length === 0 || titulo.trim().length === 0}
        onClick={upload}
      >
        Subir documento
      </Button>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
    </div>
  );
}
