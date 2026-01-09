"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/layout/forms/date-picker";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Patient } from "@/models/dashboard/patients";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { COLUMNS_PATIENTS } from "@/constants/dashboard";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [birthDate, setBirthDate] = useState<Date | undefined>(undefined);

  const tableUsers = useReactTable({
    data: patients,
    columns: COLUMNS_PATIENTS,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
      } else {
        setUser(user);
      }
    };
    getUser();
  }, [router]);

  if (!user) return <div>Cargando...</div>;

  const handleSubmitSearch = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const getPatients = async () => {
      const { data, error } = await supabase.from("patients").select("*");
      data?.map((patient) => {
        patient.gender = patient.gender === "M" ? "Masculino" : "Femenino";
      });
      return { data, error };
    };
    getPatients()
      .then(({ data, error }) => {
        if (error) {
          console.log(error);
          return;
        }
        setPatients(data as Patient[]);
      })
      .finally(() => console.log("finally"));
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-semibold">Bienvenid@</h1>
        </div>
        <div className="mt-2 mb-8">
          <h4 className="text-md font-light">
            Te damos la bienvenida al dashboard o al resumen global para que
            puedas ver tus datos.
          </h4>
          <h4 className="text-md font-light">
            Aquí podrás encontrar todos los pacientes actuales, la información
            de los mismos y cada cuanto tiempo se actualizan los datos.
          </h4>
        </div>

        <div>
          <h3 className="text-xl font-light mb-2">Buscador de pacientes</h3>
          <Separator orientation="horizontal" className="mb-8" />
          <form onSubmit={handleSubmitSearch}>
            <div className="flex gap-5 items-center align-center mt-4 flex-wrap">
              <Field className="w-full md:w-1/5">
                <FieldLabel htmlFor="name">Nombre o apellidos</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre o apellidos"
                />
              </Field>
              <Field className="w-full md:w-1/4">
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mail@vitalitty.es"
                />
              </Field>
              <Field className="w-full md:w-1/5">
                <FieldLabel htmlFor="age">Edad</FieldLabel>
                <Input
                  id="age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Edad"
                />
              </Field>
              <Field className="w-full md:w-1/5">
                <FieldLabel htmlFor="weight">Peso</FieldLabel>
                <Input
                  id="weight"
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Peso en KG"
                />
              </Field>
              <Field className="w-full md:w-1/5">
                <FieldLabel htmlFor="Gender">Sexo</FieldLabel>
                <Select
                  defaultValue=""
                  value={gender}
                  onValueChange={setGender}
                >
                  <SelectTrigger id="checkout-exp-month-ts6">
                    <SelectValue placeholder="Sexo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Femenino</SelectItem>
                    <SelectItem value="O">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="w-full md:w-1/5">
                <FieldLabel htmlFor="date">Fecha de nacimiento</FieldLabel>
                <DatePicker value={birthDate} onChange={setBirthDate} />
              </Field>
            </div>
            <div className="flex justify-end mb-8">
              <div className="flex justify-end w-2xs">
                <Button type="submit">Buscar</Button>
              </div>
            </div>
          </form>
        </div>

        <div className="mt-8 shadow-md rounded-4xl p-8 overflow-hidden max-h-[calc(100vh-20rem)]">
          <Table>
            <TableHeader>
              {tableUsers.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {tableUsers.getRowModel().rows?.length ? (
                tableUsers.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={COLUMNS_PATIENTS.length}
                    className="h-24 text-center"
                  >
                    Sin resultados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
