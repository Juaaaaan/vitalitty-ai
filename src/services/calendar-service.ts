// TODO: Replace mock data with Supabase queries
import type {
  Appointment,
  WeeklySummary,
} from "@/models/calendar/appointment.model";

function buildDate(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: "1",
    patient_id: "p1",
    start_time: buildDate(0, 9, 0),
    end_time: buildDate(0, 9, 30),
    type: "primera_cita",
    status: "pending",
    patients: {
      id: "p1",
      name_surnames: "Ana García López",
      avatar_url: undefined,
    },
  },
  {
    id: "2",
    patient_id: "p2",
    start_time: buildDate(0, 10, 0),
    end_time: buildDate(0, 10, 30),
    type: "seguimiento",
    status: "pending",
    patients: {
      id: "p2",
      name_surnames: "Carlos Martínez Ruiz",
      avatar_url: undefined,
    },
  },
  {
    id: "3",
    patient_id: "p3",
    start_time: buildDate(0, 11, 0),
    end_time: buildDate(0, 11, 30),
    type: "urgente",
    status: "pending",
    patients: {
      id: "p3",
      name_surnames: "Lucía Fernández Torres",
      avatar_url: undefined,
    },
  },
  {
    id: "4",
    patient_id: null,
    start_time: buildDate(0, 14, 0),
    end_time: buildDate(0, 15, 0),
    type: "bloqueo",
    status: "pending",
  },
  {
    id: "5",
    patient_id: "p4",
    start_time: buildDate(2, 9, 0),
    end_time: buildDate(2, 9, 45),
    type: "revision",
    status: "pending",
    patients: {
      id: "p4",
      name_surnames: "Miguel Sánchez Pérez",
      avatar_url: undefined,
    },
  },
  {
    id: "6",
    patient_id: "p5",
    start_time: buildDate(2, 11, 0),
    end_time: buildDate(2, 11, 30),
    type: "seguimiento",
    status: "completed",
    patients: {
      id: "p5",
      name_surnames: "Elena Romero Díaz",
      avatar_url: undefined,
    },
  },
  {
    id: "7",
    patient_id: "p6",
    start_time: buildDate(-2, 10, 0),
    end_time: buildDate(-2, 10, 30),
    type: "primera_cita",
    status: "completed",
    patients: {
      id: "p6",
      name_surnames: "Pablo López Jiménez",
      avatar_url: undefined,
    },
  },
  {
    id: "8",
    patient_id: "p7",
    start_time: buildDate(-2, 12, 0),
    end_time: buildDate(-2, 12, 30),
    type: "revision",
    status: "completed",
    patients: {
      id: "p7",
      name_surnames: "Sofía Morales Castro",
      avatar_url: undefined,
    },
  },
  {
    id: "9",
    patient_id: "p8",
    start_time: buildDate(5, 9, 0),
    end_time: buildDate(5, 9, 30),
    type: "seguimiento",
    status: "pending",
    patients: {
      id: "p8",
      name_surnames: "Javier Navarro Gil",
      avatar_url: undefined,
    },
  },
  {
    id: "10",
    patient_id: "p9",
    start_time: buildDate(5, 10, 30),
    end_time: buildDate(5, 11, 0),
    type: "urgente",
    status: "pending",
    patients: {
      id: "p9",
      name_surnames: "Isabel Vega Santos",
      avatar_url: undefined,
    },
  },
  {
    id: "11",
    patient_id: null,
    start_time: buildDate(7, 13, 0),
    end_time: buildDate(7, 14, 0),
    type: "bloqueo",
    status: "pending",
  },
  {
    id: "12",
    patient_id: "p10",
    start_time: buildDate(-5, 9, 0),
    end_time: buildDate(-5, 9, 30),
    type: "primera_cita",
    status: "completed",
    patients: {
      id: "p10",
      name_surnames: "Carmen Ortega Blanco",
      avatar_url: undefined,
    },
  },
];

export async function getAppointmentsForMonth(
  year: number,
  month: number,
): Promise<Appointment[]> {
  return MOCK_APPOINTMENTS.filter((a) => {
    const d = new Date(a.start_time);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export async function getWeeklySummary(): Promise<WeeklySummary> {
  return {
    completed: 18,
    total: 24,
    message: "Tu carga de trabajo está un 12% por encima de la media semanal.",
  };
}
