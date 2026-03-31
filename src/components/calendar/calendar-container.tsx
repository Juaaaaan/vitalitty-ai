"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CalendarEvent, ViewType } from "@/models/calendar.model";
import { ListIcon, Calendar, LayoutList } from "lucide-react";
import { useState } from "react";
import { ListView } from "./list-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";

interface CalendarContainerProps {
  appointments: CalendarEvent[];
}

export function CalendarContainer({ appointments }: CalendarContainerProps) {
  const [currentView, setCurrentView] = useState<ViewType>("month");
  const [currentDate, setCurrentDate] = useState(new Date());

  const handleMonthChange = (date: Date) => {
    setCurrentDate(date);
  };

  const handleWeekChange = (date: Date) => {
    setCurrentDate(date);
  };

  return (
    <div className="w-full">
      <Tabs value={currentView} onValueChange={(value) => setCurrentView(value as ViewType)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="month" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Mes</span>
          </TabsTrigger>
          <TabsTrigger value="week" className="flex items-center gap-2">
            <ListIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Semana</span>
          </TabsTrigger>
          <TabsTrigger value="list" className="flex items-center gap-2">
            <LayoutList className="h-4 w-4" />
            <span className="hidden sm:inline">Lista</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="month" className="mt-6">
          <MonthView
            appointments={appointments}
            currentDate={currentDate}
            onMonthChange={handleMonthChange}
          />
        </TabsContent>

        <TabsContent value="week" className="mt-6">
          <WeekView
            appointments={appointments}
            currentDate={currentDate}
            onWeekChange={handleWeekChange}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-6">
          <ListView appointments={appointments} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
