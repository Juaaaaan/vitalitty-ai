"use client";

import { useState, type ReactNode } from "react";
import { HistoryIcon, RotateCcwIcon, CheckCircle2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { VersionDiff } from "@/components/cerebro/version-diff";
import type { BrainVersionWithContent } from "@/models/brain/brain.models";

/**
 * Editor versionado, el mismo para prompts y para documentos.
 *
 * Las dos pestañas comparten esta pieza y cambian solo el formulario de
 * metadata que la envuelve: la lógica de guardar, activar y restaurar es la
 * parte con reglas y la que se desincronizaría si cada pestaña llevase su copia.
 *
 * Guardar y Activar son botones distintos a propósito. Guardar crea una versión
 * nueva que no afecta a ninguna generación; activar es el acto que cambia lo que
 * usa el sistema. Restaurar no reescribe el historial: carga el contenido
 * antiguo en el editor para guardarlo como versión nueva.
 */

export type VersionedEditorProps = {
  titulo: string;
  subtitulo?: string;
  versiones: BrainVersionWithContent[];
  /** Devuelve el mensaje de error, o `null` si fue bien. */
  onSave: (contenido: string, notaCambio: string) => Promise<string | null>;
  onActivate: (versionId: string) => Promise<string | null>;
  /** Formulario de metadata propio de cada pestaña. */
  children?: ReactNode;
};

export function VersionedEditor({
  titulo,
  subtitulo,
  versiones,
  onSave,
  onActivate,
  children,
}: VersionedEditorProps) {
  const active = versiones.find((version) => version.activa) ?? versiones[0];

  const [draft, setDraft] = useState(active?.contenido ?? "");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [comparing, setComparing] = useState<string | null>(null);

  // Nota: al cambiar de prompt o documento, o al activarse otra versión, el
  // editor debe arrancar de la versión activa nueva. Eso lo resuelve el padre
  // remontándolo con `key`, no un efecto que sincronice estado: sincronizarlo
  // aquí dispararía renders en cascada y el borrador a medias quedaría mezclado
  // con el contenido recién cargado.

  const run = async (
    action: () => Promise<string | null>,
    successMessage: string,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);

    const message = await action();

    setBusy(false);
    if (message) setError(message);
    else setNotice(successMessage);
  };

  const comparedVersion = versiones.find((version) => version.id === comparing);
  const previousOfCompared = comparedVersion
    ? versiones.find(
        (version) => version.version === comparedVersion.version - 1,
      )
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{titulo}</h2>
          {subtitulo && (
            <p className="text-muted-foreground text-sm">{subtitulo}</p>
          )}
        </div>
        {active ? (
          <Badge variant="secondary">
            <CheckCircle2Icon className="mr-1 size-3" />
            Versión activa: v{active.version}
          </Badge>
        ) : (
          <Badge variant="outline">Sin versión activa</Badge>
        )}
      </div>

      {children}

      <Textarea
        aria-label="Contenido"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={18}
        className="font-mono text-xs"
      />

      <Input
        aria-label="Nota de cambio"
        placeholder="Nota de cambio (opcional): por qué lo editas"
        value={nota}
        onChange={(event) => setNota(event.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || draft.trim().length === 0}
          onClick={() =>
            run(
              () => onSave(draft, nota),
              "Guardado como versión nueva. No está activa todavía.",
            )
          }
        >
          Guardar
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !versiones[0] || versiones[0].activa}
          onClick={() =>
            run(
              () => onActivate(versiones[0].id),
              `Versión v${versiones[0]?.version} activada. La siguiente generación la usará.`,
            )
          }
        >
          Activar la última versión
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}

      <Separator />

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <HistoryIcon className="size-4" />
          Histórico ({versiones.length})
        </h3>

        {versiones.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Todavía no hay versiones guardadas.
          </p>
        )}

        <ul className="space-y-2">
          {versiones.map((version) => (
            <li
              key={version.id}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span className="font-medium">v{version.version}</span>
              <span className="text-muted-foreground">
                {new Date(version.createdAt).toLocaleString("es-ES")}
              </span>
              {version.activa && <Badge variant="secondary">activa</Badge>}
              {version.notaCambio && (
                <span className="text-muted-foreground italic">
                  {version.notaCambio}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setComparing(comparing === version.id ? null : version.id)
                  }
                >
                  {comparing === version.id ? "Ocultar cambios" : "Ver cambios"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    // Restaurar = cargar el texto antiguo para guardarlo como
                    // versión nueva. El historial no se toca.
                    setDraft(version.contenido);
                    setNota(`Restaura la v${version.version}`);
                    setNotice(
                      `Cargada la v${version.version}. Guarda para crear una versión nueva con ese contenido.`,
                    );
                    setError(null);
                  }}
                >
                  <RotateCcwIcon className="mr-1 size-3" />
                  Restaurar
                </Button>
                {!version.activa && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => onActivate(version.id),
                        `Versión v${version.version} activada.`,
                      )
                    }
                  >
                    Activar
                  </Button>
                )}
              </div>

              {comparing === version.id && (
                <div className="w-full pt-2">
                  <VersionDiff
                    before={previousOfCompared?.contenido ?? ""}
                    after={version.contenido}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
