import {
  dueDateState,
  DEFAULT_SERVICE_LEVEL_TARGETS,
  defaultDueDate,
} from "./service-level-targets";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("service level targets", () => {
  it("suggests Critical 7, High 30, Medium 90 and no target for Low", () => {
    expect(DEFAULT_SERVICE_LEVEL_TARGETS).toEqual({
      critical: 7,
      high: 30,
      medium: 90,
      low: null,
    });
  });

  describe("defaultDueDate", () => {
    const on = { enabled: true, days: DEFAULT_SERVICE_LEVEL_TARGETS };

    it("adds the target days of the severity to now", () => {
      expect(defaultDueDate(on, "CRITICAL", NOW)).toEqual(
        new Date("2026-11-27T10:00:00.000Z"),
      );
      expect(defaultDueDate(on, "HIGH", NOW)).toEqual(
        new Date("2026-12-20T10:00:00.000Z"),
      );
      expect(defaultDueDate(on, "medium", NOW)).toEqual(
        new Date("2027-02-18T10:00:00.000Z"),
      );
    });

    it("gives no due date when targets are off", () => {
      expect(
        defaultDueDate({ ...on, enabled: false }, "CRITICAL", NOW),
      ).toBeUndefined();
    });

    it("gives no due date for a severity without a target", () => {
      expect(defaultDueDate(on, "LOW", NOW)).toBeUndefined();
      expect(defaultDueDate(on, "NONE", NOW)).toBeUndefined();
      expect(defaultDueDate(on, undefined, NOW)).toBeUndefined();
    });
  });

  describe("dueDateState", () => {
    it("is overdue once the due date has passed", () => {
      expect(dueDateState(new Date(NOW.getTime() - 1), NOW)).toBe("overdue");
    });

    it("is due soon within the next seven days", () => {
      expect(dueDateState(NOW, NOW)).toBe("due_soon");
      expect(dueDateState(new Date(NOW.getTime() + 7 * DAY - 1), NOW)).toBe(
        "due_soon",
      );
    });

    it("is on track further out, and none without a due date", () => {
      expect(dueDateState(new Date(NOW.getTime() + 7 * DAY), NOW)).toBe(
        "on_track",
      );
      expect(dueDateState(undefined, NOW)).toBe("none");
      expect(dueDateState(null, NOW)).toBe("none");
    });
  });
});
