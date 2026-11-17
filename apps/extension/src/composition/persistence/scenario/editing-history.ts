import { parseGuideProjectBatch } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import type { ScenarioEditingHistory } from './contracts';

/** Admit detached navigation branches without treating autosave revisions as user actions. */
export function parseScenarioEditingHistory(
  value: unknown,
  current: GuideProject
): ScenarioEditingHistory | undefined | null {
  if (value === undefined) return undefined;
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 3 ||
    value['version'] !== 1 ||
    !Array.isArray(value['past']) ||
    !Array.isArray(value['future']) ||
    value['past'].length + value['future'].length > EDITOR_HISTORY_LIMITS.maxActions
  )
    return null;
  const rawPast: unknown[] = value['past'];
  const rawFuture: unknown[] = value['future'];
  const past: GuideProject[] = [];
  const future: GuideProject[] = [];
  if (rawPast.length + rawFuture.length === 0) return { version: 1, past, future };
  const measure = createScenarioEditingBudget();
  if (!measure(current)) return null;
  let index = 0;
  for (const parsed of parseGuideProjectBatch([...rawPast, ...rawFuture])) {
    if (parsed.status !== 'ok' || parsed.project.id !== current.id || !measure(parsed.project))
      return null;
    (index++ < rawPast.length ? past : future).push(parsed.project);
  }
  return { version: 1, past, future };
}

interface EditingMeasureCache {
  roots: WeakMap<GuideProject, number>;
  units: WeakMap<object, { key: string; bytes: number }>;
}

function createScenarioEditingBudget(cache?: EditingMeasureCache) {
  const encoder = new TextEncoder();
  const units = new Set<string>();
  const measured = new WeakSet<object>();
  let bytes = 0;
  function measure(project: GuideProject): boolean {
    const { items, tour, ...root } = project;
    let rootBytes = cache?.roots.get(project);
    if (rootBytes === undefined) {
      rootBytes =
        encoder.encode(
          JSON.stringify({ ...root, items: [], ...(tour ? { tour: { ...tour, slides: [] } } : {}) })
        ).byteLength +
        Math.max(0, items.length - 1) +
        Math.max(0, (tour?.slides.length ?? 0) - 1);
      cache?.roots.set(project, rootBytes);
    }
    bytes += rootBytes;
    for (const [kind, values] of [
      ['guide', items],
      ['tour', tour?.slides ?? []],
    ] as const) {
      for (const unit of values) {
        if (measured.has(unit)) continue;
        measured.add(unit);
        let encoded = cache?.units.get(unit);
        if (!encoded) {
          const json = JSON.stringify(unit);
          encoded = { key: `${kind}:${json}`, bytes: encoder.encode(json).byteLength };
          cache?.units.set(unit, encoded);
        }
        if (units.has(encoded.key)) continue;
        units.add(encoded.key);
        bytes += encoded.bytes;
        if (bytes > EDITOR_HISTORY_LIMITS.maxBytes) return false;
      }
    }
    return bytes <= EDITOR_HISTORY_LIMITS.maxBytes;
  }
  return measure;
}

/** Select the nearest states from admitted projects under the shared navigation budget. */
export function retainScenarioEditingHistory(
  current: GuideProject,
  past: readonly GuideProject[],
  future: readonly GuideProject[] = []
): ScenarioEditingHistory {
  return retainScenarioEditingWindow(current, past, future);
}

/** One reducer may cache encodings of its immutable projects and units without retaining them. */
export function createScenarioEditingRetainer() {
  const cache: EditingMeasureCache = { roots: new WeakMap(), units: new WeakMap() };
  return (
    current: GuideProject,
    past: readonly GuideProject[],
    future: readonly GuideProject[] = []
  ) => retainScenarioEditingWindow(current, past, future, cache);
}

function retainScenarioEditingWindow(
  current: GuideProject,
  past: readonly GuideProject[],
  future: readonly GuideProject[],
  cache?: EditingMeasureCache
): ScenarioEditingHistory {
  const before: GuideProject[] = [];
  const after: GuideProject[] = [];
  if (past.length || future.length) {
    const measure = createScenarioEditingBudget(cache);
    if (measure(current)) {
      const distances = Math.max(past.length, future.length);
      outer: for (let distance = 1; distance <= distances; distance++) {
        for (const [project, retained] of [
          [past[past.length - distance], before],
          [future[distance - 1], after],
        ] as const) {
          if (!project) continue;
          if (
            before.length + after.length === EDITOR_HISTORY_LIMITS.maxActions ||
            !measure(project)
          )
            break outer;
          retained.push(project);
        }
      }
    }
  }
  return { version: 1, past: before.reverse(), future: after };
}
