"use client";

import { useMemo } from "react";

/**
 * Diff textual entre dos versiones, línea a línea.
 *
 * Basta para lo que hace falta aquí: ver qué se tocó entre la versión anterior
 * y la nueva antes de activarla. LCS clásico sobre líneas, calculado en cliente
 * —los documentos son texto de la propia consulta, no hay nada que pedir al
 * servidor para esto.
 */

type DiffLine = { kind: "same" | "added" | "removed"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split("\n");
  const right = after.split("\n");

  // Tabla de longitudes del subconjunto común más largo.
  const lengths: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array(right.length + 1).fill(0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        left[i] === right[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: "same", text: left[i] });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push({ kind: "removed", text: left[i] });
      i += 1;
    } else {
      lines.push({ kind: "added", text: right[j] });
      j += 1;
    }
  }

  while (i < left.length) {
    lines.push({ kind: "removed", text: left[i] });
    i += 1;
  }
  while (j < right.length) {
    lines.push({ kind: "added", text: right[j] });
    j += 1;
  }

  return lines;
}

const STYLES: Record<DiffLine["kind"], string> = {
  same: "text-muted-foreground",
  added: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  removed: "bg-red-500/10 text-red-700 line-through dark:text-red-400",
};

const PREFIX: Record<DiffLine["kind"], string> = {
  same: " ",
  added: "+",
  removed: "−",
};

export function VersionDiff({
  before,
  after,
}: {
  before: string;
  after: string;
}) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const changed = lines.some((line) => line.kind !== "same");

  if (!changed) {
    return (
      <p className="text-muted-foreground text-sm">
        Esta versión no cambia nada respecto a la anterior.
      </p>
    );
  }

  return (
    <pre className="max-h-80 overflow-auto rounded-md border p-3 text-xs leading-relaxed">
      {lines.map((line, index) => (
        <div key={`${index}-${line.text}`} className={STYLES[line.kind]}>
          {PREFIX[line.kind]} {line.text || " "}
        </div>
      ))}
    </pre>
  );
}
