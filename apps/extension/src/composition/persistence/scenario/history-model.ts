import {
  parseGuideProject,
  parseGuideProjectBatch,
} from '@sniptale/runtime-contracts/scenario/guide-parser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ScenarioProjectEntry, ScenarioSavedVersion } from './contracts';
import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';
import { SCENARIO_SAVED_VERSION_LIMITS } from '../../../features/editor-history/policy';

export const SCENARIO_HISTORY_LIMIT = 50;
export const SCENARIO_HISTORY_BYTE_LIMIT = 64 * 1024 * 1024;
/** A page issues an opaque identity; revision CAS remains the mutation authority. */
export function isScenarioHistoryActionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
  );
}
const encoder = new TextEncoder();
function versionSize(
  version: ScenarioSavedVersion,
  parts: Map<string, number>,
  units?: WeakMap<object, number>
): number {
  function bytes(value: unknown): number {
    const object = typeof value === 'object' && value !== null ? value : undefined;
    const known = object ? units?.get(object) : undefined;
    if (known !== undefined) return known;
    const json = JSON.stringify(value) ?? 'null';
    const previous = parts.get(json);
    const size = previous ?? encoder.encode(json).byteLength;
    parts.set(json, size);
    if (object) units?.set(object, size);
    return size;
  }
  const { items, tour } = version.project;
  const project = {
    ...version.project,
    items: [],
    ...(tour ? { tour: { ...tour, slides: [] } } : {}),
  };
  // Empty arrays already supply brackets; only encoded elements and commas remain.
  let size = bytes({ ...version, project }) + Math.max(0, items.length - 1);
  for (const item of items) size += bytes(item);
  if (tour) {
    size += Math.max(0, tour.slides.length - 1);
    for (const slide of tour.slides) size += bytes(slide);
  }
  return size;
}

/**
 * Admits a bounded, ordered history belonging to this aggregate and preceding its current revision.
 * Exclusive input must be a private freshly read graph; shared canonical items never leave that
 * owner's immutable historical snapshots. Borrowed callers retain independent detached versions.
 */
export function parseScenarioSavedVersions(
  value: unknown,
  projectId: string,
  currentRevision: number,
  currentSavedAt: number,
  ownership: 'borrowed' | 'exclusive' = 'borrowed'
): ScenarioSavedVersion[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > SCENARIO_HISTORY_LIMIT) return null;
  const versions: ScenarioSavedVersion[] = [];
  let previousRevision = -1;
  let previousSavedAt = -1;
  let bytes = 0;
  const parts = new Map<string, number>();
  const units = ownership === 'exclusive' ? new WeakMap<object, number>() : undefined;
  const projects =
    ownership === 'exclusive'
      ? parseGuideProjectBatch(value.map((raw: unknown) => (isRecord(raw) ? raw['project'] : null)))
      : undefined;
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const revision = raw['revision'];
    const savedAt = raw['savedAt'];
    if (
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision <= previousRevision ||
      revision >= currentRevision ||
      typeof savedAt !== 'number' ||
      !Number.isFinite(savedAt) ||
      savedAt < 0 ||
      savedAt <= previousSavedAt ||
      savedAt >= currentSavedAt
    )
      return null;
    const parsed = projects ? projects.next().value : parseGuideProject(raw['project']);
    if (
      !parsed ||
      parsed.status !== 'ok' ||
      parsed.project.id !== projectId ||
      parsed.project.updatedAt !== savedAt
    )
      return null;
    const version = { revision, savedAt, project: parsed.project };
    bytes += versionSize(version, parts, units);
    if (bytes > SCENARIO_HISTORY_BYTE_LIMIT) return null;
    versions.push(version);
    previousRevision = revision;
    previousSavedAt = savedAt;
  }
  return versions;
}

/**
 * Appends committed content with the same byte/count retention.
 * Borrowed inputs detach by default. Exclusive inputs must be a private, freshly admitted
 * canonical snapshot that the caller owns and never exposes or mutates after this append.
 */
export function appendScenarioSavedVersion(
  existing: ScenarioProjectEntry | undefined,
  ownership: 'borrowed' | 'exclusive' = 'borrowed'
): ScenarioSavedVersion[] {
  if (!existing) return [];
  return retainScenarioSavedVersions(
    [
      ...(existing.history ?? []),
      {
        revision: existing.workspaceRevision,
        savedAt: existing.project.updatedAt,
        project: existing.project,
      },
    ],
    ownership
  );
}

/** Mutation-only compaction follows complete legacy admission; current content is outside this budget. */
export function retainScenarioSavedVersions(
  versions: readonly ScenarioSavedVersion[],
  ownership: 'borrowed' | 'exclusive' = 'borrowed'
): ScenarioSavedVersion[] {
  const parts = new Map<string, number>();
  const units = ownership === 'exclusive' ? new WeakMap<object, number>() : undefined;
  // One reserved byte plus each element's comma covers the exact JSON array framing.
  const window = selectHistoryRetentionWindow(
    versions.map((version) => ({ actions: 1, bytes: versionSize(version, parts, units) + 1 })),
    versions.length,
    { ...SCENARIO_SAVED_VERSION_LIMITS, maxBytes: SCENARIO_SAVED_VERSION_LIMITS.maxBytes - 1 }
  );
  const retained = versions.slice(window.start, window.end);
  return ownership === 'exclusive' ? retained : structuredClone(retained);
}
