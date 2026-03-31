import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTypeColor,
  getStatusBadgeColor,
  getStatusLabel,
  getTypeLabel,
  filterAppointmentsByDateRange,
  sortAppointmentsByDateTime,
} from "@/services/calendar-service";
import type { CalendarEvent } from "@/models/calendar.model";

describe("Calendar Service", () => {
  describe("Color utilities", () => {
    it("should return correct color for consultation type", () => {
      const color = getTypeColor("consultation");
      expect(color).toContain("blue");
      expect(color).toContain("bg-blue");
    });

    it("should return correct color for appointment type", () => {
      const color = getTypeColor("appointment");
      expect(color).toContain("green");
      expect(color).toContain("bg-green");
    });

    it("should return correct color for blocked type", () => {
      const color = getTypeColor("blocked");
      expect(color).toContain("gray");
      expect(color).toContain("bg-gray");
    });

    it("should return correct badge color for confirmed status", () => {
      const color = getStatusBadgeColor("confirmed");
      expect(color).toContain("green");
    });

    it("should return correct badge color for pending status", () => {
      const color = getStatusBadgeColor("pending");
      expect(color).toContain("yellow");
    });

    it("should return correct badge color for blocked status", () => {
      const color = getStatusBadgeColor("blocked");
      expect(color).toContain("gray");
    });
  });

  describe("Label utilities", () => {
    it("should return correct label for consultation type", () => {
      expect(getTypeLabel("consultation")).toBe("Consulta");
    });

    it("should return correct label for appointment type", () => {
      expect(getTypeLabel("appointment")).toBe("Cita");
    });

    it("should return correct label for blocked type", () => {
      expect(getTypeLabel("blocked")).toBe("Bloqueada");
    });

    it("should return correct label for confirmed status", () => {
      expect(getStatusLabel("confirmed")).toBe("Confirmada");
    });

    it("should return correct label for pending status", () => {
      expect(getStatusLabel("pending")).toBe("Pendiente");
    });

    it("should return correct label for blocked status", () => {
      expect(getStatusLabel("blocked")).toBe("Bloqueada");
    });
  });

  describe("Date filtering", () => {
    let mockAppointments: CalendarEvent[];

    beforeEach(() => {
      mockAppointments = [
        {
          id: "apt-1",
          patientId: "patient-1",
          patientName: "Test Patient 1",
          type: "consultation",
          title: "Test Appointment 1",
          description: "Test",
          date: "2026-04-05",
          startTime: "09:00",
          endTime: "10:00",
          location: "Room 1",
          status: "confirmed",
          notes: "",
          startDateTime: new Date("2026-04-05T09:00:00"),
          endDateTime: new Date("2026-04-05T10:00:00"),
        },
        {
          id: "apt-2",
          patientId: "patient-2",
          patientName: "Test Patient 2",
          type: "appointment",
          title: "Test Appointment 2",
          description: "Test",
          date: "2026-04-08",
          startTime: "14:00",
          endTime: "15:00",
          location: "Room 2",
          status: "confirmed",
          notes: "",
          startDateTime: new Date("2026-04-08T14:00:00"),
          endDateTime: new Date("2026-04-08T15:00:00"),
        },
        {
          id: "apt-3",
          patientId: "patient-3",
          patientName: "Test Patient 3",
          type: "blocked",
          title: "Test Appointment 3",
          description: "Test",
          date: "2026-04-10",
          startTime: "10:00",
          endTime: "11:00",
          location: "Room 3",
          status: "blocked",
          notes: "",
          startDateTime: new Date("2026-04-10T10:00:00"),
          endDateTime: new Date("2026-04-10T11:00:00"),
        },
      ];
    });

    it("should filter appointments within date range", () => {
      const startDate = new Date("2026-04-05");
      const endDate = new Date("2026-04-08");

      const filtered = filterAppointmentsByDateRange(mockAppointments, startDate, endDate);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe("apt-1");
      expect(filtered[1].id).toBe("apt-2");
    });

    it("should return empty array when no appointments match", () => {
      const startDate = new Date("2026-05-01");
      const endDate = new Date("2026-05-31");

      const filtered = filterAppointmentsByDateRange(mockAppointments, startDate, endDate);

      expect(filtered).toHaveLength(0);
    });

    it("should include appointments at exact start and end dates", () => {
      const startDate = new Date("2026-04-05");
      const endDate = new Date("2026-04-10");

      const filtered = filterAppointmentsByDateRange(mockAppointments, startDate, endDate);

      expect(filtered).toHaveLength(3);
    });
  });

  describe("Sorting", () => {
    let mockAppointments: CalendarEvent[];

    beforeEach(() => {
      mockAppointments = [
        {
          id: "apt-2",
          patientId: "patient-2",
          patientName: "Test Patient 2",
          type: "appointment",
          title: "Test Appointment 2",
          description: "Test",
          date: "2026-04-08",
          startTime: "14:00",
          endTime: "15:00",
          location: "Room 2",
          status: "confirmed",
          notes: "",
          startDateTime: new Date("2026-04-08T14:00:00"),
          endDateTime: new Date("2026-04-08T15:00:00"),
        },
        {
          id: "apt-1",
          patientId: "patient-1",
          patientName: "Test Patient 1",
          type: "consultation",
          title: "Test Appointment 1",
          description: "Test",
          date: "2026-04-05",
          startTime: "09:00",
          endTime: "10:00",
          location: "Room 1",
          status: "confirmed",
          notes: "",
          startDateTime: new Date("2026-04-05T09:00:00"),
          endDateTime: new Date("2026-04-05T10:00:00"),
        },
      ];
    });

    it("should sort appointments by date and time", () => {
      const sorted = sortAppointmentsByDateTime(mockAppointments);

      expect(sorted[0].id).toBe("apt-1");
      expect(sorted[1].id).toBe("apt-2");
    });

    it("should not modify original array", () => {
      const original = [...mockAppointments];
      sortAppointmentsByDateTime(mockAppointments);

      expect(mockAppointments).toEqual(original);
    });
  });
});
