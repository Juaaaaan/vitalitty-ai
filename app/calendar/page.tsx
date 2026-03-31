"use client";

import { Separator } from "@/components/ui/separator";

export default function CalendarPage() {
  return (
    <div className="min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Calendario
          </h1>
        </div>
        <div className="mt-2 mb-8">
          <h4 className="text-md font-light text-gray-600 dark:text-gray-300">
            Aquí podrás revisar todos los eventos que tienes disponibles.
          </h4>
        </div>

        <Separator orientation="horizontal" className="mb-8 dark:bg-gray-700" />
      </div>
    </div>
  );
}
