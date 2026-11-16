import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { SCENARIO_PROJECT_REVISIONS_STORE } from '../infrastructure/indexed-db/core.stores';

interface RevisionReader {
  objectStore(name: string): { get(key: string): Promise<unknown> };
}

/** Read the local deletion fence without requiring an enrolled sync profile. */
export async function readRetainedScenarioRevision(
  tx: RevisionReader,
  projectId: string
): Promise<number | null> {
  const raw = await tx.objectStore(SCENARIO_PROJECT_REVISIONS_STORE).get(projectId);
  if (raw === undefined) return null;
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    raw['projectId'] !== projectId ||
    typeof raw['revision'] !== 'number' ||
    !Number.isSafeInteger(raw['revision']) ||
    raw['revision'] < 0
  )
    throw new Error('Invalid retained Scenario revision.');
  return raw['revision'];
}

/** Retire the live revision in the same transaction that removes the native root. */
export async function retainScenarioRevision(
  tx: {
    objectStore(name: string): {
      get(key: string): Promise<unknown>;
      put(value: unknown): Promise<unknown>;
    };
  },
  projectId: string,
  currentRevision: number
): Promise<void> {
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0)
    throw new Error('Invalid local Scenario revision.');
  const retained = await readRetainedScenarioRevision(tx, projectId);
  await tx.objectStore(SCENARIO_PROJECT_REVISIONS_STORE).put({
    version: 1,
    projectId,
    revision: Math.max(currentRevision, retained ?? 0),
  });
}
