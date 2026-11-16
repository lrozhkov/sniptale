import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { IMAGE_WORKSPACE_IDENTITIES_STORE } from '../infrastructure/indexed-db/core.stores';

export interface ImageWorkspaceIdentity {
  version: 1;
  aggregateId: string;
  generation: string;
  retired: boolean;
}

interface IdentityReader {
  objectStore(name: typeof IMAGE_WORKSPACE_IDENTITIES_STORE): {
    get(id: string): Promise<unknown>;
  };
}

interface IdentityWriter {
  objectStore(name: typeof IMAGE_WORKSPACE_IDENTITIES_STORE): {
    get(id: string): Promise<unknown>;
    put(value: ImageWorkspaceIdentity): Promise<unknown>;
  };
}

/** Reads lifetime evidence in the caller's root transaction. Legacy absence has generation null. */
export async function readImageWorkspaceIdentity(
  tx: IdentityReader,
  aggregateId: string
): Promise<ImageWorkspaceIdentity | null> {
  const value = await tx.objectStore(IMAGE_WORKSPACE_IDENTITIES_STORE).get(aggregateId);
  if (value === undefined) return null;
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 4 ||
    value['version'] !== 1 ||
    value['aggregateId'] !== aggregateId ||
    typeof value['generation'] !== 'string' ||
    !value['generation'].length ||
    value['generation'].length > 200 ||
    typeof value['retired'] !== 'boolean'
  )
    throw new Error('Image workspace lifetime evidence is invalid.');
  return { version: 1, aggregateId, generation: value['generation'], retired: value['retired'] };
}

/** Default creation cannot adopt a retired identity or an orphan live lifetime. */
export async function createImageWorkspaceIdentity(
  tx: IdentityWriter,
  aggregateId: string
): Promise<string> {
  if (await readImageWorkspaceIdentity(tx, aggregateId))
    throw new Error('Image workspace identity already exists.');
  const generation = crypto.randomUUID();
  await tx
    .objectStore(IMAGE_WORKSPACE_IDENTITIES_STORE)
    .put({ version: 1, aggregateId, generation, retired: false });
  return generation;
}

/** Explicit restore owns replay admission and publishes its fresh lifetime with the restored root. */
export async function restoreImageWorkspaceIdentity(
  tx: IdentityWriter,
  aggregateId: string
): Promise<string> {
  await readImageWorkspaceIdentity(tx, aggregateId);
  const generation = crypto.randomUUID();
  await tx
    .objectStore(IMAGE_WORKSPACE_IDENTITIES_STORE)
    .put({ version: 1, aggregateId, generation, retired: false });
  return generation;
}

/** Retirement survives root removal, including removal before the first editor workspace exists. */
export async function retireImageWorkspaceIdentity(
  tx: IdentityWriter,
  aggregateId: string
): Promise<void> {
  const previous = await readImageWorkspaceIdentity(tx, aggregateId);
  if (previous?.retired) return;
  await tx.objectStore(IMAGE_WORKSPACE_IDENTITIES_STORE).put({
    version: 1,
    aggregateId,
    generation: previous?.generation ?? crypto.randomUUID(),
    retired: true,
  });
}
