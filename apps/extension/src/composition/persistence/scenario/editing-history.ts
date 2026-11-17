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

function createScenarioEditingBudget() {
  const encoder = new TextEncoder();
  const units = new Set<string>();
  const measured = new WeakSet<object>();
  let bytes = 0;
  function measure(project: GuideProject): boolean {
    const { items, tour, ...root } = project;
    bytes += encoder.encode(
      JSON.stringify({ ...root, items: [], ...(tour ? { tour: { ...tour, slides: [] } } : {}) })
    ).byteLength;
    bytes += Math.max(0, items.length - 1) + Math.max(0, (tour?.slides.length ?? 0) - 1);
    for (const [kind, values] of [
      ['guide', items],
      ['tour', tour?.slides ?? []],
    ] as const) {
      for (const unit of values) {
        if (measured.has(unit)) continue;
        measured.add(unit);
        const json = JSON.stringify(unit);
        const key = `${kind}:${json}`;
        if (units.has(key)) continue;
        units.add(key);
        bytes += encoder.encode(json).byteLength;
        if (bytes > EDITOR_HISTORY_LIMITS.maxBytes) return false;
      }
    }
    return bytes <= EDITOR_HISTORY_LIMITS.maxBytes;
  }
  return measure;
}

/** Select the nearest past from canonically admitted projects, sharing immutable unit accounting. */
export function retainScenarioEditingHistory(
  current: GuideProject,
  past: readonly GuideProject[]
): ScenarioEditingHistory {
  const retained: GuideProject[] = [];
  if (past.length) {
    const measure = createScenarioEditingBudget();
    if (measure(current)) {
      const start = Math.max(0, past.length - EDITOR_HISTORY_LIMITS.maxActions);
      for (let index = past.length - 1; index >= start; index--) {
        const project = past[index]!;
        if (!measure(project)) break;
        retained.push(project);
      }
    }
  }
  return { version: 1, past: retained.reverse(), future: [] };
}
