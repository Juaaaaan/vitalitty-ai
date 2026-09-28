"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Patient } from "@/models/dashboard/patients";

function contactOf(patient: Patient): string {
  return [patient.mail, patient.phone].filter(Boolean).join(" · ");
}

/**
 * Selector de paciente existente.
 *
 * A diferencia de `ComboBox`, la clave de cada opción es el `id` y cada una
 * enseña email y teléfono: dos homónimos son dos entradas distintas y
 * distinguibles, que es justo lo que la elección explícita necesita.
 */
export function PatientPicker({
  patients,
  selectedId,
  onSelect,
}: {
  patients: Patient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = patients.find((patient) => patient.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="truncate">
            {selected
              ? `${selected.name_surnames}${contactOf(selected) ? ` — ${contactOf(selected)}` : ""}`
              : "Selecciona un paciente"}
          </span>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Busca por nombre, email o teléfono..." />
          <CommandList>
            <CommandEmpty>Ningún paciente coincide.</CommandEmpty>
            <CommandGroup>
              {patients.map((patient) => (
                <CommandItem
                  key={patient.id}
                  // El id va en el valor para que dos homónimos no colisionen.
                  value={`${patient.name_surnames} ${contactOf(patient)} ${patient.id}`}
                  onSelect={() => {
                    onSelect(patient.id);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      patient.id === selectedId ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{patient.name_surnames}</span>
                    {contactOf(patient) && (
                      <span className="text-xs text-muted-foreground">
                        {contactOf(patient)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
