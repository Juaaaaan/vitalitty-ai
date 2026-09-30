"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/layout/login-form";
import Image from "next/image";
import { ErrorLoginCodes } from "@/models/authErrors";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorLoginCodes | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError({
      code: "",
      message: "",
    });

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error && error.code && error.message) {
      setError({
        code: error.code,
        message: error.message,
      });
      setLoading(false);
    } else {
      setError(null);
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <span className="flex items-center gap-2 font-medium">
            <div className="text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <Image src="/logo_azul.png" alt="Logo" width={24} height={24} />
            </div>
            Vitalitty AI
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm
              onSubmit={handleLogin}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              loading={loading}
              error={error}
            />
          </div>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:block">
        <Image
          src="/home_vitalitty-ai.jpg"
          alt="Landscape picture"
          width={800}
          height={1000}
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
