"use client";

import { useState } from "react";
import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IDENTITY_CONFLICT_EXPLANATION_MESSAGE,
  IDENTITY_CONFLICT_TITLE_MESSAGE,
  SAME_PATIENT_RESOLUTION_MESSAGE,
  STALE_RECORD_RESOLUTION_MESSAGE,
  UNSAVED_DIET_WARNING_MESSAGE,
  WRONG_MAIL_RESOLUTION_MESSAGE,
} from "@/constants/patient-memory";
import type {
  IdentityField,
  IdentityResolution,
  PatientIdentityConflict,
} from "@/models/patient-identity/identity-conflict.models";

/**
 * Qué hacer cuando el correo dictado ya es de otro paciente.
 *
 * La pantalla no decide: enseña las dos identidades campo a campo y ofrece las
 * tres salidas, que son los tres errores posibles. Aunque todo coincida sigue
 * pidiendo elegir — emparejar por su cuenta es justo lo que el flujo de
 * selección de paciente decidió no hacer.
 *
 * Mientras tanto la dieta vive aquí, en memoria: por eso el aviso de que no
 * está guardada es parte de la pantalla y no una nota al pie.
 */

const ETIQUETAS: Record<IdentityField, string> = {
  nameSurnames: "Nombre y apellidos",
  age: "Edad",
  mail: "Correo",
  phone: "Teléfono",
};

const SALIDAS: { resolution: IdentityResolution; label: string }[] = [
  { resolution: "mismo-paciente", label: SAME_PATIENT_RESOLUTION_MESSAGE },
  { resolution: "email-mal-dictado", label: WRONG_MAIL_RESOLUTION_MESSAGE },
  { resolution: "datos-guardados-mal", label: STALE_RECORD_RESOLUTION_MESSAGE },
];

export type IdentityConflictResolution = {
  consultationId: string;
  patientId: string;
  dietVersion: number | null;
};

export function IdentityConflictResolver({
  conflict,
  dietMd,
  transcription,
  extraction,
  onResolved,
}: {
  conflict: PatientIdentityConflict;
  dietMd: string;
  transcription: string | null;
  extraction: unknown;
  onResolved: (resolution: IdentityConflictResolution) => void;
}) {
  const [busy, setBusy] = useState<IdentityResolution | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolver = async (resolution: IdentityResolution) => {
    setBusy(resolution);
    setError(null);

    try {
      const response = await fetch("/api/resolve-identity-conflict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution,
          dietMd,
          transcription,
          existingPatientId: conflict.existingPatientId,
          extraction,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        // La dieta se queda en pantalla: se puede reintentar sin regenerar.
        setError(payload.error ?? "No se ha podido guardar la consulta.");
        return;
      }

      onResolved(payload as IdentityConflictResolution);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-amber-500/40 p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangleIcon className="size-4 text-amber-500" />
          {IDENTITY_CONFLICT_TITLE_MESSAGE}
        </h2>
        <p className="text-muted-foreground text-sm">
          {IDENTITY_CONFLICT_EXPLANATION_MESSAGE}
        </p>
      </div>

      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
        {UNSAVED_DIET_WARNING_MESSAGE}
      </p>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-medium">Dato</th>
              <th className="p-2 text-left font-medium">Ficha guardada</th>
              <th className="p-2 text-left font-medium">Dictado hoy</th>
            </tr>
          </thead>
          <tbody>
            {conflict.fields.map((field) => (
              <tr key={field.field} className="border-t">
                <td className="text-muted-foreground p-2">
                  {ETIQUETAS[field.field]}
                </td>
                <td className="p-2">{field.existing ?? "—"}</td>
                <td className="p-2">
                  <span className="flex flex-wrap items-center gap-2">
                    {field.extracted ?? "—"}
                    {field.status === "difiere" && (
                      <Badge variant="destructive">no coincide</Badge>
                    )}
                    {field.status === "falta" && (
                      <Badge variant="outline">sin dato</Badge>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link
        href={`/dashboard/patient/${conflict.existingPatientId}`}
        target="_blank"
        className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
      >
        Ver la ficha guardada
        <ExternalLinkIcon className="size-3" />
      </Link>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-col gap-2">
        {SALIDAS.map(({ resolution, label }) => (
          <Button
            key={resolution}
            variant={resolution === "mismo-paciente" ? "default" : "secondary"}
            disabled={busy !== null}
            onClick={() => resolver(resolution)}
            className="justify-start"
          >
            {busy === resolution ? "Guardando…" : label}
          </Button>
        ))}
      </div>
    </section>
  );
}
