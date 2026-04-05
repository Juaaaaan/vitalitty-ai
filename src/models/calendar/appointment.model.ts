export type AppointmentType =
  | "seguimiento"
  | "primera_cita"
  | "revision"
  | "urgente"
  | "bloqueo";

export type AppointmentStatus = "pending" | "completed" | "cancelled";

export interface Appointment {
  id: string;
  patient_id: string | null;
  start_time: string;
  end_time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  notes?: string;
  patients?: {
    id: string;
    name_surnames: string;
    avatar_url?: string;
  };
}

export interface WeeklySummary {
  completed: number;
  total: number;
  message: string;
}

export const APPOINTMENT_COLORS: Record<AppointmentType, string> = {
  seguimiento: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  primera_cita: "bg-blue-600 text-white",
  revision: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
  bloqueo: "bg-muted text-muted-foreground",
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  seguimiento: "Seguimiento",
  primera_cita: "Primera Cita",
  revision: "Revisión",
  urgente: "Urgente",
  bloqueo: "Bloqueo",
};
