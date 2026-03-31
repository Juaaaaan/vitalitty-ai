"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  // Initialize theme state lazily to avoid hydration issues
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    // Get theme from external system (localStorage/system preference)
    const stored = localStorage.getItem("theme");
    let initialTheme: "light" | "dark";

    if (stored === "dark" || stored === "light") {
      initialTheme = stored;
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      initialTheme = prefersDark ? "dark" : "light";
    }

    // Update external system (DOM) synchronously
    document.documentElement.classList.toggle("dark", initialTheme === "dark");

    // Update React state asynchronously to avoid cascading renders
    // Using setTimeout moves setState to a callback, not synchronous effect body
    const timeoutId = setTimeout(() => {
      setTheme(initialTheme);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  const toggleTheme = () => {
    if (!theme) return; // Guard against null state
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  // Avoid hydration mismatch by rendering a neutral state until mounted
  if (theme === null) {
    return (
      <Button variant="ghost" size="icon" className="size-9" disabled>
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="size-9"
      title={
        theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
      }
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Cambiar tema</span>
    </Button>
  );
}
