"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";

export default function CalendarPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Calendario
          </h1>
        </div>
      </div>
    </div>
  );
}
