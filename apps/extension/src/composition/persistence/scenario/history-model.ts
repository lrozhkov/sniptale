import {
  parseGuideProject,
  parseGuideProjectBatch,
} from '@sniptale/runtime-contracts/scenario/guide-parser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ScenarioProjectEntry, ScenarioSavedVersion } from './contracts';

export const SCENARIO_HISTORY_LIMIT = 50;
export const SCENARIO_HISTORY_BYTE_LIMIT = 64 * 1024 * 1024;
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
  const versions = [
    ...(existing.history ?? []),
    {
      revision: existing.workspaceRevision,
      savedAt: existing.project.updatedAt,
      project: existing.project,
    },
  ].slice(-SCENARIO_HISTORY_LIMIT);
  let bytes = 0;
  const parts = new Map<string, number>();
  const units = ownership === 'exclusive' ? new WeakMap<object, number>() : undefined;
  let first = versions.length;
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    const version = versions[index];
    if (!version) continue;
    const size = versionSize(version, parts, units);
    if (bytes + size > SCENARIO_HISTORY_BYTE_LIMIT) break;
    bytes += size;
    first = index;
  }
  if (first === versions.length)
    throw new Error('The saved guide exceeds the history metadata limit.');
  const retained = versions.slice(first);
  return ownership === 'exclusive' ? retained : structuredClone(retained);
}
