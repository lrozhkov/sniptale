import type { VideoProjectExportTimeEstimate } from '../types/export';

/** A timeline interval with a relative rendering cost; no frames or media are retained. */
export interface ExportTimeWorkInterval {
  start: number;
  end: number;
  cost: number;
  route?: 'composite' | 'accelerated' | 'clean' | 'copy';
}

const MAX_INTERVALS = 256;
const MIN_MEASURED_MS = 1500;
// Decode/encode and composition overlap; additional drawing passes are only a weak
// throughput prior until this export has measured that class on the current machine.
const priorCost = (cost: number) => 1 + (cost - 1) * 0.25;

/** Bounds planning work independently of frame rate and movie duration. */
export function planExportTimeWork(
  start: number,
  end: number,
  boundaries: readonly number[],
  costAt: (time: number) => number
): ExportTimeWorkInterval[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const points = [...new Set([start, end, ...boundaries.filter((n) => n > start && n < end)])].sort(
    (a, b) => a - b
  );
  const count = Math.min(MAX_INTERVALS, points.length - 1);
  return Array.from({ length: count }, (_, index) => {
    const from = points[Math.floor((index * (points.length - 1)) / count)]!;
    const to = points[Math.floor(((index + 1) * (points.length - 1)) / count)]!;
    const cost = costAt((from + to) / 2);
    return {
      start: from,
      end: to,
      cost: Number.isFinite(cost) ? Math.max(1, Math.min(16, cost)) : 1,
    };
  });
}

/** Learns this export's throughput from elapsed producer time, including codec backpressure. */
export function createExportTimeEstimator(
  initialPlan: readonly ExportTimeWorkInterval[],
  now: () => number = () => performance.now(),
  transform: (
    raw: VideoProjectExportTimeEstimate | null
  ) => VideoProjectExportTimeEstimate | null = (raw) => raw
) {
  let plan = initialPlan.slice(0, MAX_INTERVALS);
  let completed = plan[0]?.start ?? 0;
  let previous = now();
  let elapsed = 0;
  let observations = 0;
  let measuredUnits = 0;
  let base = { elapsedMs: 0, units: 0 };
  let additionalRemainingMs = 0;
  const rates = new Map<number, { elapsedMs: number; units: number }>();
  const accumulate = (
    old: { elapsedMs: number; units: number } | undefined,
    ms: number,
    units: number
  ) => {
    const retain = Math.exp(-units / 3);
    return {
      elapsedMs: (old?.elapsedMs ?? 0) * retain + ms,
      units: (old?.units ?? 0) * retain + units,
    };
  };
  const routeIndex = { composite: 0, accelerated: 1, clean: 2, copy: 3 };
  const costClass = (item: Pick<ExportTimeWorkInterval, 'cost' | 'route'>) =>
    routeIndex[item.route ?? 'composite'] * 64 +
    Math.min(64, Math.max(4, Math.round(item.cost * 4)));

  function snapshot(): VideoProjectExportTimeEstimate | null {
    if (elapsed < MIN_MEASURED_MS || observations < 3 || measuredUnits < 0.5 || base.units <= 0)
      return transform(null);
    const baseRate = base.elapsedMs / base.units;
    let remainingMs = additionalRemainingMs;
    for (const item of plan) {
      const units = Math.max(0, item.end - Math.max(item.start, completed));
      const learned = rates.get(costClass(item));
      const confidence = Math.min(1, (learned?.units ?? 0) / 1);
      const rate =
        baseRate * priorCost(item.cost) * (1 - confidence) +
        (learned ? learned.elapsedMs / learned.units : 0) * confidence;
      remainingMs += units * rate;
    }
    return transform(Number.isFinite(remainingMs) && remainingMs > 0 ? { remainingMs } : null);
  }

  return {
    snapshot,
    /** Excludes setup or separately measured audio work from video throughput. */
    resume() {
      previous = now();
    },
    setAdditionalRemainingMs(value: number) {
      additionalRemainingMs = Number.isFinite(value) ? Math.max(0, value) : 0;
    },
    /** A supported route can fall back without erasing already measured progress. */
    replacePlan(next: readonly ExportTimeWorkInterval[]) {
      plan = next.slice(0, MAX_INTERVALS);
    },
    observe(position: number): VideoProjectExportTimeEstimate | null {
      const current = now();
      const delta = current - previous;
      previous = current;
      if (!Number.isFinite(position) || position <= completed) return snapshot();
      const end = Math.min(position, plan.at(-1)?.end ?? completed);
      let weighted = 0;
      const portions: Array<Pick<ExportTimeWorkInterval, 'cost' | 'route'> & { units: number }> =
        [];
      for (const item of plan) {
        const units = Math.max(0, Math.min(end, item.end) - Math.max(completed, item.start));
        if (units > 0) {
          portions.push({ units, cost: item.cost, ...(item.route ? { route: item.route } : {}) });
          weighted += units * priorCost(item.cost);
        }
      }
      completed = end;
      if (!Number.isFinite(delta) || delta <= 0 || weighted <= 0) return snapshot();
      elapsed += delta;
      observations++;
      measuredUnits += portions.reduce((sum, part) => sum + part.units, 0);
      // Ratios of accumulated work dilute one-off startup latency; smoothing per-frame
      // rates would retain the first slow frame throughout a short export.
      base = accumulate(base, delta, weighted);
      // A mixed observation cannot identify each class separately; only train pure windows.
      const classes = new Set(portions.map((part) => costClass(part)));
      if (classes.size === 1) {
        const units = portions.reduce((sum, part) => sum + part.units, 0);
        const key = costClass(portions[0]!);
        const old = rates.get(key);
        rates.set(key, accumulate(old, delta, units));
      }
      return snapshot();
    },
  };
}

export type ExportTimeEstimator = ReturnType<typeof createExportTimeEstimator>;
