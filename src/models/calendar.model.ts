export type AppointmentType = "consultation" | "appointment" | "blocked";
export type AppointmentStatus = "confirmed" | "pending" | "blocked";

export interface CalendarAppointment {
  id: string;
  patientId: string;
  patientName: string;
  type: AppointmentType;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  status: AppointmentStatus;
  notes: string;
}

export interface CalendarEvent extends CalendarAppointment {
  startDateTime: Date;
  endDateTime: Date;
}

export type ViewType = "month" | "week" | "list";
