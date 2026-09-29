"use client";

import { FileText } from "lucide-react";

type DocumentLinkProps = {
  url: string;
  version: number | null;
  /** Fecha de la consulta de esa versión, en ISO corto. */
  fecha: string | null;
};

const LONG_DATE = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(fecha: string | null): string | null {
  if (!fecha) return null;

  const [year, month, day] = fecha.split("-").map(Number);
  return LONG_DATE.format(new Date(year, month - 1, day));
}

/**
 * Enlace al PDF de una dieta.
 *
 * La URL nunca se enseña: es una firma larguísima que caduca en una hora y no
 * dice nada. Lo que identifica al documento es su versión y su fecha, que es
 * como se habla de las dietas en el resto de la aplicación.
 */
export function DocumentLink({ url, version, fecha }: DocumentLinkProps) {
  const date = formatDate(fecha);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="font-medium">
        {version != null ? `Ver dieta v${version}` : "Ver dieta"}
      </span>
      {date && <span className="text-muted-foreground">· {date}</span>}
    </a>
  );
}
