"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, FileText, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Vista previa, corrección y aprobación del documento de dieta.
 *
 * El orden es deliberado: generar deja un borrador, la vista previa es barata
 * y se puede refrescar en cada corrección, y solo al aprobar nace un PDF. Nada
 * baja al disco del usuario antes de esa aprobación.
 *
 * La vista previa va en un iframe con `srcDoc`: los estilos de la plantilla son
 * los del documento impreso, con sus propias tipografías y tamaños en puntos, y
 * no deben mezclarse con los de la aplicación.
 */

interface DietApprovalProps {
  consultationId: string;
  dietMd: string;
  /** Avisa al contenedor de que el documento cambió, para que no sirva el viejo. */
  onDietMdChange: (dietMd: string) => void;
}

type Mode = "preview" | "edit";

export function DietApproval({
  consultationId,
  dietMd,
  onDietMdChange,
}: DietApprovalProps) {
  const [mode, setMode] = useState<Mode>("preview");
  const [html, setHtml] = useState<string | null>(null);
  const [structured, setStructured] = useState(false);
  const [draft, setDraft] = useState(dietMd);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setError(null);

    try {
      const response = await fetch("/api/diet-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "No se pudo cargar la vista previa.");
        return;
      }

      setHtml(result.html);
      setStructured(result.structured);
    } catch {
      setError("No se pudo cargar la vista previa. Inténtalo de nuevo.");
    } finally {
      setIsLoadingPreview(false);
    }
  }, [consultationId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/diet-document", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, dietMd: draft }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "No se pudo guardar la dieta.");
        return;
      }

      onDietMdChange(draft);
      // El PDF que hubiera deja de valer: su huella ya no coincide.
      setPdfUrl(null);
      setMode("preview");
      await loadPreview();
    } catch {
      setError("No se pudo guardar la dieta. Inténtalo de nuevo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    setError(null);

    try {
      const response = await fetch("/api/diet-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "No se pudo generar el PDF.");
        return;
      }

      setPdfUrl(result.url);
    } catch {
      setError("No se pudo generar el PDF. Inténtalo de nuevo.");
    } finally {
      setIsApproving(false);
    }
  };

  if (mode === "edit") {
    return (
      <div className="space-y-3">
        <Textarea
          aria-label="Documento de la dieta"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-[50vh] font-mono text-xs"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isSaving ? "Guardando…" : "Guardar cambios"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setDraft(dietMd);
              setError(null);
              setMode("preview");
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-white">
        {isLoadingPreview && !html ? (
          <p className="p-4 text-xs text-gray-500">Cargando vista previa…</p>
        ) : (
          <iframe
            title="Vista previa de la dieta"
            srcDoc={html ?? ""}
            className="h-[60vh] w-full border-0"
          />
        )}
      </div>

      {!structured && html && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Esta dieta es anterior al formato con plantilla: se muestra tal cual y
          no puede descargarse en PDF.
        </p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={() => {
            setDraft(dietMd);
            setMode("edit");
          }}
        >
          <Pencil className="h-4 w-4" />
          Modificar
        </Button>

        {pdfUrl ? (
          <Button asChild className="flex-1 gap-2">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download>
              <Download className="h-4 w-4" />
              Descargar PDF
            </a>
          </Button>
        ) : (
          <Button
            onClick={handleApprove}
            disabled={isApproving || !structured}
            className="flex-1 gap-2"
          >
            {isApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {isApproving ? "Generando PDF…" : "Aprobar y generar PDF"}
          </Button>
        )}
      </div>
    </div>
  );
}
