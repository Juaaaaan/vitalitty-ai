"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarEvent } from "@/models/calendar.model";
import {
  getStatusBadgeColor,
  getStatusLabel,
  getTypeColor,
  getTypeLabel,
} from "@/services/calendar-service";
import { format } from "date-fns";
import { Clock, MapPin } from "lucide-react";

interface AppointmentCardProps {
  appointment: CalendarEvent;
}

export function AppointmentCard({ appointment }: AppointmentCardProps) {
  const statusColor = getStatusBadgeColor(appointment.status);
  const typeColor = getTypeColor(appointment.type);

  return (
    <Card className={`border-l-4 ${typeColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-base">{appointment.title}</CardTitle>
            <CardDescription className="mt-1">{appointment.patientName}</CardDescription>
          </div>
          <div className="flex gap-1">
            <Badge variant="outline" className="text-xs">
              {getTypeLabel(appointment.type)}
            </Badge>
            <Badge className={`text-xs ${statusColor}`}>{getStatusLabel(appointment.status)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">{appointment.description}</p>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <span>{format(appointment.startDateTime, "HH:mm")} - {format(appointment.endDateTime, "HH:mm")}</span>
          </div>

          {appointment.location !== "N/A" && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              <span>{appointment.location}</span>
            </div>
          )}
        </div>

        {appointment.notes && <p className="text-xs italic text-gray-500">📝 {appointment.notes}</p>}
      </CardContent>
    </Card>
  );
}
