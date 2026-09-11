import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ScenarioProjectEntry, ScenarioSavedVersion } from './contracts';

export const SCENARIO_HISTORY_LIMIT = 50;
export const SCENARIO_HISTORY_BYTE_LIMIT = 64 * 1024 * 1024;
const encoder = new TextEncoder();
function versionSize(version: ScenarioSavedVersion): number {
  return encoder.encode(JSON.stringify(version)).byteLength;
}

/** Admits a bounded, ordered history belonging to this aggregate and preceding its current revision. */
export function parseScenarioSavedVersions(
  value: unknown,
  projectId: string,
  currentRevision: number,
  currentSavedAt: number
): ScenarioSavedVersion[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > SCENARIO_HISTORY_LIMIT) return null;
  const versions: ScenarioSavedVersion[] = [];
  let previousRevision = -1;
  let previousSavedAt = -1;
  let bytes = 0;
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
    const parsed = parseGuideProject(raw['project']);
    if (
      parsed.status !== 'ok' ||
      parsed.project.id !== projectId ||
      parsed.project.updatedAt !== savedAt
    )
      return null;
    const version = { revision, savedAt, project: parsed.project };
    bytes += versionSize(version);
    if (bytes > SCENARIO_HISTORY_BYTE_LIMIT) return null;
    versions.push(version);
    previousRevision = revision;
    previousSavedAt = savedAt;
  }
  return versions;
}

/** Appends only committed content; byte/count retention never duplicates physical image data. */
export function appendScenarioSavedVersion(
  existing: ScenarioProjectEntry | undefined
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
  let first = versions.length;
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    const version = versions[index];
    if (!version) continue;
    const size = versionSize(version);
    if (bytes + size > SCENARIO_HISTORY_BYTE_LIMIT) break;
    bytes += size;
    first = index;
  }
  if (first === versions.length)
    throw new Error('The saved guide exceeds the history metadata limit.');
  return structuredClone(versions.slice(first));
}
