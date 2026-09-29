"use client";

import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProposedAction } from "@/models/assistant/assistant.models";

type ProposalCardProps = {
  action: ProposedAction;
  pending: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
};

/**
 * Una escritura propuesta, a la espera de decisión.
 *
 * Mientras esta tarjeta está en pantalla no se ha guardado nada: el asistente
 * solo ha preparado la acción. Por eso dice a quién afecta y qué se hará, con
 * las palabras de la petición: confirmar a ciegas sería lo mismo que dejar que
 * la IA escriba sola.
 */
export function ProposalCard({
  action,
  pending,
  onConfirm,
  onDiscard,
}: ProposalCardProps) {
  return (
    <Card className="border-amber-300 dark:border-amber-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="size-4 text-amber-500" />
          Confirma antes de guardar
        </CardTitle>
        <CardDescription>
          {action.patientName
            ? `Afecta a ${action.patientName}. Nada se ha guardado todavía.`
            : "Nada se ha guardado todavía."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <p className="text-sm">{action.summary}</p>
      </CardContent>

      <CardFooter className="gap-2">
        <Button onClick={onConfirm} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {pending ? "Guardando…" : "Confirmar"}
        </Button>
        <Button variant="outline" onClick={onDiscard} disabled={pending}>
          <X className="size-4" />
          Descartar
        </Button>
      </CardFooter>
    </Card>
  );
}
