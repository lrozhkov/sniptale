import type { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoProjectExportTimeEstimate } from '../types/export';

const HISTORY_LIMIT = 10;
const CHECKPOINT_LIMIT = 12;
const CHECKPOINT_SPACING_MS = 5000;
const MIN_CHECKPOINT_REMAINING_MS = 1000;
const INITIAL_RESERVE = 0.2;

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

/** Groups comparable render settings without storing media or hardware identifiers. */
export function createExportTimeProfile(settings: {
  editor: 'project' | 'review';
  route: 'render' | 'copy';
  container: 'mp4' | 'webm';
  codec: 'avc' | 'hevc' | 'vp8' | 'vp9' | 'av1';
  width: number;
  height: number;
  fps: number;
  quality: VideoQuality;
  complexity: number;
}): string {
  const bounded = (value: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(1, value)) : 1;
  const pixels = bounded(Math.ceil((settings.width * settings.height) / 262144), 256);
  const fps = bounded(Math.round(settings.fps), 240);
  const complexity = bounded(Math.ceil(settings.complexity), 16);
  return [
    settings.editor,
    settings.route,
    settings.container,
    settings.codec,
    `p${pixels}`,
    `f${fps}`,
    `q${settings.quality}`,
    `c${complexity}`,
  ].join('-');
}

/** Calibrates raw predictions; callers record history only after successful measured work. */
export function createExportTimeCalibration(now: () => number = () => performance.now()) {
  let startedAt = now();
  let previous = startedAt;
  let finished = false;
  let bias = 1;
  const checkpoints: Array<{ at: number; remainingMs: number }> = [];

  function clock(): number | null {
    const current = now();
    if (!Number.isFinite(current) || (Number.isFinite(previous) && current < previous)) {
      return null;
    }
    if (!Number.isFinite(startedAt)) startedAt = current;
    previous = current;
    return current;
  }

  return {
    setHistory(history: readonly number[]) {
      const valid = history
        .filter((ratio) => Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4)
        .slice(-HISTORY_LIMIT);
      const confidence = valid.length / HISTORY_LIMIT;
      bias = valid.length ? 1 + (median(valid) - 1) * confidence : 1;
    },
    estimate(raw: VideoProjectExportTimeEstimate | null): VideoProjectExportTimeEstimate | null {
      if (finished || !raw || !Number.isFinite(raw.remainingMs) || raw.remainingMs <= 0) {
        return null;
      }
      const current = clock();
      if (current === null) return null;
      const elapsed = current - startedAt;
      const progress = elapsed / (elapsed + raw.remainingMs);
      const remainingMs = raw.remainingMs * bias * (1 + INITIAL_RESERVE * (1 - progress));
      if (!Number.isFinite(remainingMs)) return null;
      const last = checkpoints.at(-1);
      if (
        raw.remainingMs >= MIN_CHECKPOINT_REMAINING_MS &&
        (!last || current - last.at >= CHECKPOINT_SPACING_MS)
      ) {
        // Keep initial evidence and a rolling late window without retaining every frame.
        if (checkpoints.length === CHECKPOINT_LIMIT) checkpoints.splice(3, 1);
        checkpoints.push({ at: current, remainingMs: raw.remainingMs });
      }
      return { remainingMs };
    },
    finish(): readonly number[] {
      if (finished) return [];
      finished = true;
      const current = clock();
      if (current === null) return [];
      const ratios = checkpoints
        .filter((checkpoint) => current > checkpoint.at)
        .map((checkpoint) => (current - checkpoint.at) / checkpoint.remainingMs)
        .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
      // One vote per completed export; reserve never becomes training input.
      return ratios.length ? [Math.min(4, Math.max(0.25, median(ratios)))] : [];
    },
  };
}
