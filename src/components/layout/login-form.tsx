import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ErrorLoginCodes } from "@/models/authErrors";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";

interface LoginFormProps extends React.ComponentProps<"form"> {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: ErrorLoginCodes | null;
  loading: boolean;
}

const translateError = (error: string) => {
  switch (error) {
    case "User not found":
      return "Usuario no encontrado";
    case "Incorrect password":
      return "Contraseña incorrecta";
    case "invalid_credentials":
      return "Credenciales inválidas";
    default:
      return "Error al iniciar sesión";
  }
};

export function LoginForm({
  className,
  email,
  setEmail,
  password,
  setPassword,
  error,
  loading,
  ...props
}: LoginFormProps) {
  return (
    <form className={cn("flex flex-col gap-6", className)} {...props}>
      {error && error.code && error.message && (
        <div className="bg-red-50 text-red-500 p-3 rounded">
          {translateError(error.code)}
        </div>
      )}
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Inicie sesión en su cuenta</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Introduzca su correo electrónico a continuación para iniciar sesión
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="m@vitalitty.es"
            required
            value={email || ""}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>

            <Dialog>
              <DialogTrigger asChild>
                <span className="ml-auto text-sm underline-offset-4 hover:underline bg-transparent border-none p-0 cursor-pointer">
                  ¿Olvidó su contraseña?
                </span>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>¿Olvidó su contraseña?</DialogTitle>
                  <DialogDescription>
                    Introduzca su correo electrónico y te enviaremos un código
                    de recuperación
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="grid flex-1 gap-2">
                    <Label htmlFor="link" className="sr-only">
                      Email
                    </Label>
                    <Input placeholder="m@vitalitty.es" id="link" />
                  </div>
                </div>
                <DialogFooter className="sm:justify-end">
                  <DialogClose asChild>
                    <Button type="button">Enviar</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Input
            id="password"
            type="password"
            required
            value={password || ""}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
