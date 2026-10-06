import { browserStorage as defaultBrowserStorage } from '../infrastructure/browser-storage';
import { tryRunWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';

export const EXPORT_TIME_HISTORY_KEY = 'sniptale_export_time_history';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 100;
const MAX_PROFILE_ROWS = 10;
const LOCK_NAME = 'sniptale-export-time-history';

interface HistoryRow {
  profile: string;
  at: number;
  ratio: number;
}

interface HistoryDependencies {
  browserStorage?: Pick<typeof defaultBrowserStorage, 'local'>;
  now?: () => number;
  withPermit?: typeof tryRunWithPersistenceMutationPermit;
  withLock?: (operation: () => Promise<void>) => Promise<void>;
}

function validProfile(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false;
  const match =
    /^(project|review)-(render|copy)-(mp4|webm)-(avc|hevc|vp8|vp9|av1)-p([1-9]\d{0,2})-f([1-9]\d{0,2})-q(LOW|MEDIUM|HIGH|ULTRA)-c([1-9]\d?)$/.exec(
      value
    );
  return !!match && Number(match[5]) <= 256 && Number(match[6]) <= 240 && Number(match[8]) <= 16;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.25 && value <= 4;
}

function parseRows(value: unknown, now: number): HistoryRow[] {
  if (!record(value) || value['version'] !== 1 || !Array.isArray(value['rows'])) return [];
  if (value['rows'].length > MAX_ROWS) return [];
  const rows: HistoryRow[] = [];
  for (const row of value['rows']) {
    if (
      !record(row) ||
      !validProfile(row['profile']) ||
      !validRatio(row['ratio']) ||
      typeof row['at'] !== 'number' ||
      !Number.isFinite(row['at']) ||
      row['at'] <= 0
    )
      return [];
    if (row['at'] <= now && now - row['at'] <= MAX_AGE_MS)
      rows.push({ profile: row['profile'], at: row['at'], ratio: row['ratio'] });
  }
  return boundRows(rows);
}

function boundRows(rows: HistoryRow[]): HistoryRow[] {
  const counts = new Map<string, number>();
  return rows
    .sort((a, b) => b.at - a.at)
    .filter((row) => {
      const count = counts.get(row.profile) ?? 0;
      counts.set(row.profile, count + 1);
      return count < MAX_PROFILE_ROWS;
    })
    .slice(0, MAX_ROWS);
}

async function withHistoryLock(operation: () => Promise<void>): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks) return;
  await navigator.locks.request(
    LOCK_NAME,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (lock) await operation();
    }
  );
}

/** Local advisory calibration only: unavailable storage or coordination never blocks export. */
export function createExportTimeHistory(dependencies: HistoryDependencies = {}) {
  const browserStorage = dependencies.browserStorage ?? defaultBrowserStorage;
  const now = dependencies.now ?? Date.now;
  const withPermit = dependencies.withPermit ?? tryRunWithPersistenceMutationPermit;
  const withLock = dependencies.withLock ?? withHistoryLock;
  return {
    async read(profile: string, signal: AbortSignal): Promise<readonly number[]> {
      if (signal.aborted || !validProfile(profile)) return [];
      try {
        const time = now();
        if (!Number.isFinite(time) || time <= 0) return [];
        const stored = await browserStorage.local.get(EXPORT_TIME_HISTORY_KEY);
        if (signal.aborted) return [];
        return parseRows(stored[EXPORT_TIME_HISTORY_KEY], time)
          .filter((row) => row.profile === profile)
          .map((row) => row.ratio);
      } catch {
        return [];
      }
    },
    async record(profile: string, ratios: readonly number[], signal: AbortSignal): Promise<void> {
      if (signal.aborted || !validProfile(profile) || ratios.length !== 1 || !validRatio(ratios[0]))
        return;
      const ratio = ratios[0];
      try {
        await withPermit((permit) =>
          withLock(async () => {
            if (signal.aborted) return;
            const stored = await browserStorage.local.get(EXPORT_TIME_HISTORY_KEY);
            const time = now();
            if (signal.aborted || !Number.isFinite(time) || time <= 0) return;
            const rows = boundRows([
              { profile, at: time, ratio },
              ...parseRows(stored[EXPORT_TIME_HISTORY_KEY], time),
            ]);
            await browserStorage.local.set(
              { [EXPORT_TIME_HISTORY_KEY]: { version: 1, rows } },
              permit
            );
          })
        );
      } catch {
        // Advisory measurements may be discarded; media export has already succeeded.
      }
    },
  };
}
