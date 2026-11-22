/** Days allowed per severity; null means no target for that severity. */
export interface ServiceLevelTargetDays {
  critical: number | null;
  high: number | null;
  medium: number | null;
  low: number | null;
}

/** An organization's service level targets, off unless enabled. */
export interface ServiceLevelTargets {
  enabled: boolean;
  days: ServiceLevelTargetDays;
}

/** Suggested targets an organization starts with. */
export const DEFAULT_SERVICE_LEVEL_TARGETS: ServiceLevelTargetDays = {
  critical: 7,
  high: 30,
  medium: 90,
  low: null,
};

/** Reads the targets from an organization's settings columns. */
export function targetsOf(organization: {
  service_level_targets_enabled: boolean;
  service_level_targets: ServiceLevelTargetDays | null;
}): ServiceLevelTargets {
  return {
    enabled: organization.service_level_targets_enabled,
    days: {
      ...DEFAULT_SERVICE_LEVEL_TARGETS,
      ...organization.service_level_targets,
    },
  };
}

/** The due date the user gave, else the default from the targets. */
export function dueDateFor(
  given: string | undefined,
  targets: ServiceLevelTargets,
  severityClass: string | null | undefined,
  now: Date,
): Date | undefined {
  if (given) return new Date(given);
  return defaultDueDate(targets, severityClass, now);
}

/** How far ahead a due date counts as due soon. */
const DUE_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a ticket stands against its due date. */
export type DueDateState = "overdue" | "due_soon" | "on_track" | "none";

/** The due date a new ticket of this severity gets, or undefined when none applies. */
export function defaultDueDate(
  targets: ServiceLevelTargets,
  severityClass: string | null | undefined,
  now: Date,
): Date | undefined {
  if (!targets.enabled || !severityClass) return undefined;
  const key = severityClass.toLowerCase();
  if (!(key in targets.days)) return undefined;
  const days = targets.days[key as keyof ServiceLevelTargetDays];
  if (days === null || days === undefined) return undefined;
  return new Date(now.getTime() + days * DAY_MS);
}

/** Overdue once the due date has passed, due soon within the next seven days. */
export function dueDateState(
  dueDate: Date | null | undefined,
  now: Date,
): DueDateState {
  if (!dueDate) return "none";
  const left = dueDate.getTime() - now.getTime();
  if (left < 0) return "overdue";
  return left < DUE_SOON_DAYS * DAY_MS ? "due_soon" : "on_track";
}

/** The start and end of the due soon window, for queries. */
export function dueSoonWindow(now: Date): { from: Date; until: Date } {
  return { from: now, until: new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS) };
}
