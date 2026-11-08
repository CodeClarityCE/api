/** An experiment's snapshot grid: dates stepped back from its creation day, plus HEAD. */

export enum GridInterval {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
}

export const DEFAULT_GRID_INTERVAL = GridInterval.MONTH;
export const DEFAULT_GRID_COUNT = 24;
export const MAX_GRID_COUNT = 120;

export const DAY_MS = 86_400_000;

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

const DAY_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;
// A trailing UTC offset such as -05:00 or +0200
const OFFSET_SUFFIX = /[T ][\d:.]+([+-])(\d{2}):?(\d{2})$/;

/** A real calendar day, so 2025-02-30 is rejected rather than rolled over. */
function validDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * The UTC day (YYYY-MM-DD) an advisory was published, from its verbatim
 * timestamp. Times without a zone are read as UTC; null when unreadable.
 */
export function publishedDay(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const day = DAY_PREFIX.exec(text);
  if (day) {
    if (!validDay(Number(day[1]), Number(day[2]), Number(day[3]))) return null;
    if (!OFFSET_SUFFIX.test(text)) return day[0];
    // Shift by the offset to land on the UTC day
    const parsed = Date.parse(
      text.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"),
    );
    return Number.isNaN(parsed) ? null : gridDay(new Date(parsed));
  }
  // Other formats, such as RFC 2822, as the JS date parser reads them
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : gridDay(new Date(parsed));
}

/** A run is HEAD when it has no grid date. */
export function isHead(run: { grid_date?: Date | null }): boolean {
  return !run.grid_date;
}

/** The runs of one grid date; null for HEAD. */
export interface GridGroup<R> {
  grid_date: string | null;
  runs: R[];
}

/** Runs grouped by grid date, oldest first, HEAD last. */
export function groupByGridDate<R extends { grid_date?: Date | null }>(
  runs: readonly R[],
): GridGroup<R>[] {
  const groups = new Map<string, GridGroup<R>>();
  for (const run of runs) {
    const date = isHead(run) ? null : gridDay(run.grid_date!);
    const key = date ?? "HEAD";
    let group = groups.get(key);
    if (!group) {
      group = { grid_date: date, runs: [] };
      groups.set(key, group);
    }
    group.runs.push(run);
  }
  // YYYY-MM-DD sorts by date and "HEAD" after any digit
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : Number(a > b)))
    .map(([, group]) => group);
}

/** Instances by the run whose rows they are (a run's rows_run_id). */
export function instancesByRun<V extends { run_id: string }>(
  instances: readonly V[],
): Map<string, V[]> {
  const byRun = new Map<string, V[]>();
  for (const v of instances) {
    const list = byRun.get(v.run_id) ?? [];
    list.push(v);
    byRun.set(v.run_id, list);
  }
  return byRun;
}
