"use client";

import { useState } from "react";
import { BrainIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PromptsTab } from "@/components/cerebro/prompts-tab";
import { DocumentsTab } from "@/components/cerebro/documents-tab";

type Tab = "prompts" | "documentacion";

/**
 * El Cerebro: lo que el sistema sabe y cómo se le pide que lo use.
 *
 * Dos pestañas sobre el mismo editor versionado. Lo que se guarda aquí no
 * cambia ninguna generación hasta que se activa, y a partir de entonces la
 * siguiente lo usa sin desplegar nada.
 */
export function BrainConsole() {
  const [tab, setTab] = useState<Tab>("prompts");

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BrainIcon className="size-6" />
          Cerebro
        </h1>
        <p className="text-muted-foreground text-sm">
          Las instrucciones con las que se generan las dietas y el conocimiento
          que entra en contexto. Guardar crea una versión nueva; activarla es lo
          que cambia la siguiente generación.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Secciones del Cerebro"
        className="flex gap-2"
      >
        <Button
          role="tab"
          aria-selected={tab === "prompts"}
          variant={tab === "prompts" ? "default" : "outline"}
          onClick={() => setTab("prompts")}
        >
          Prompts
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "documentacion"}
          variant={tab === "documentacion" ? "default" : "outline"}
          onClick={() => setTab("documentacion")}
        >
          Documentación
        </Button>
      </div>

      <Separator />

      {tab === "prompts" ? <PromptsTab /> : <DocumentsTab />}
    </div>
  );
}
