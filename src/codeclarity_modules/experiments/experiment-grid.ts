/** An experiment's snapshot grid: dates stepped back from its creation day, plus HEAD. */

export enum GridInterval {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
}

export const DEFAULT_GRID_INTERVAL = GridInterval.MONTH;
export const DEFAULT_GRID_COUNT = 24;
export const MAX_GRID_COUNT = 120;

const DAY_MS = 86_400_000;

/** One snapshot of the grid: HEAD has no grid date and the last index. */
export interface GridSnapshot {
  grid_index: number;
  grid_date: Date | null;
}

/** Midnight UTC of the date `months` months before `day`, clamped to month end. */
function monthsBefore(day: Date, months: number): Date {
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day.getUTCDate(), lastDay)));
}

/** The grid date `steps` intervals before the creation day. */
function stepBack(day: Date, interval: GridInterval, steps: number): Date {
  if (interval === GridInterval.MONTH) return monthsBefore(day, steps);
  const days = interval === GridInterval.WEEK ? 7 : 1;
  return new Date(day.getTime() - steps * days * DAY_MS);
}

/** The grid's snapshots oldest first, HEAD last. A count of 0 is HEAD only. */
export function snapshotGrid(
  createdOn: Date,
  interval: GridInterval,
  count: number,
): GridSnapshot[] {
  const day = new Date(
    Date.UTC(
      createdOn.getUTCFullYear(),
      createdOn.getUTCMonth(),
      createdOn.getUTCDate(),
    ),
  );
  const dated = Array.from({ length: count }, (_, index) => ({
    grid_index: index,
    grid_date: stepBack(day, interval, count - index),
  }));
  return [...dated, { grid_index: count, grid_date: null }];
}

/** A grid date as its calendar day, YYYY-MM-DD. */
export function gridDay(gridDate: Date): string {
  return gridDate.toISOString().slice(0, 10);
}

/** The last instant of a grid date's calendar day (UTC). */
export function endOfGridDay(gridDate: Date): Date {
  return new Date(gridDate.getTime() + DAY_MS - 1);
}
