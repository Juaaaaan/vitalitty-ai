import { Patient } from "@/models/dashboard/patients";
import { ColumnDef } from "@tanstack/react-table";

export const COLUMNS_PATIENTS: ColumnDef<Patient>[] = [
  {
    accessorKey: "name_surnames",
    header: "Nombre y apellidos",
  },
  {
    accessorKey: "mail",
    header: "Email",
  },
  {
    accessorKey: "age",
    header: "Edad",
  },
  {
    accessorKey: "gender",
    header: "Género",
  },
  {
    accessorKey: "phone",
    header: "Teléfono",
  },
  {
    accessorKey: "weight",
    header: "Peso",
  },
  {
    accessorKey: "height",
    header: "Altura",
  },
];
