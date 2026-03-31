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

export function ComboBox({
  users,
  onSelect,
}: {
  users: Patient[];
  onSelect?: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[350px] justify-between"
        >
          {value
            ? users.find((user) => user.name_surnames === value)?.name_surnames
            : "Selecciona un usuario"}
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px]">
        <Command>
          <CommandInput placeholder="Buscando usuario..." />
          <CommandList>
            <CommandEmpty>No usuario encontrado.</CommandEmpty>
            <CommandGroup>
              {users.map((user: Patient) => (
                <CommandItem
                  key={user.id}
                  value={user.name_surnames}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    if (onSelect) onSelect(user.id);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === user.name_surnames
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {user.name_surnames}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
