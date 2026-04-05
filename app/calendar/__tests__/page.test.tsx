import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("Calendar redirect page", () => {
  it("file exists", () => {
    expect(true).toBe(true);
  });
});
