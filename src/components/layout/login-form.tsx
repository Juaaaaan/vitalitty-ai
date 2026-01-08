import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ErrorLoginCodes } from "@/models/authErrors";

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
      {error && (
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
            <a
              href="#"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              ¿Olvidó su contraseña?
            </a>
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
