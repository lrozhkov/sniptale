import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { IMAGE_WORKSPACE_IDENTITIES_STORE } from '../infrastructure/indexed-db/core.stores';

export interface ImageWorkspaceIdentity {
  version: 1;
  aggregateId: string;
  generation: string;
  retired: boolean;
  legacyMove?: LegacyImageWorkspaceMove;
  retiredRevision?: number;
}

interface LegacyImageWorkspaceMove {
  revision: number;
  previousGeneration: string | null;
  projectGeneration: string | null;
  discardedPublicationId: string | null;
  trashedAt: number | null;
}

function isGeneration(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isLegacyMove(value: unknown): value is LegacyImageWorkspaceMove {
  return (
    isPlainRecord(value) &&
    Object.keys(value).length === 5 &&
    typeof value['revision'] === 'number' &&
    Number.isSafeInteger(value['revision']) &&
    value['revision'] >= 1 &&
    (value['previousGeneration'] === null || isGeneration(value['previousGeneration'])) &&
    (value['projectGeneration'] === null || isGeneration(value['projectGeneration'])) &&
    (value['trashedAt'] === null ||
      (typeof value['trashedAt'] === 'number' && Number.isFinite(value['trashedAt']))) &&
    (value['discardedPublicationId'] === null ||
      (value['projectGeneration'] === null && isGeneration(value['discardedPublicationId'])))
  );
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

/** Reads a lifetime record, including pre-upgrade publication evidence when present. */
export function parseImageWorkspaceIdentity(
  value: unknown,
  aggregateId: string
): ImageWorkspaceIdentity | null {
  if (!isPlainRecord(value)) return null;
  const move = value['legacyMove'];
  const retiredRevision = value['retiredRevision'];
  if (
    Object.keys(value).length !==
      4 + Number(move !== undefined) + Number(retiredRevision !== undefined) ||
    value['version'] !== 1 ||
    value['aggregateId'] !== aggregateId ||
    !isGeneration(value['generation']) ||
    typeof value['retired'] !== 'boolean' ||
    (move !== undefined && (value['retired'] || !isLegacyMove(move))) ||
    (retiredRevision !== undefined &&
      (!value['retired'] ||
        typeof retiredRevision !== 'number' ||
        !Number.isSafeInteger(retiredRevision) ||
        retiredRevision < 1))
  )
    return null;
  return {
    version: 1,
    aggregateId,
    generation: value['generation'],
    retired: value['retired'],
    ...(move ? { legacyMove: move } : {}),
    ...(retiredRevision === undefined ? {} : { retiredRevision }),
  };
}

/** Reads lifetime evidence in the caller's root transaction. Legacy absence has generation null. */
export async function readImageWorkspaceIdentity(
  tx: IdentityReader,
  aggregateId: string
): Promise<ImageWorkspaceIdentity | null> {
  const value = await tx.objectStore(IMAGE_WORKSPACE_IDENTITIES_STORE).get(aggregateId);
  if (value === undefined) return null;
  const parsed = parseImageWorkspaceIdentity(value, aggregateId);
  if (!parsed) throw new Error('Image workspace lifetime evidence is invalid.');
  return parsed;
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
  aggregateId: string,
  retiredRevision?: number
): Promise<void> {
  const previous = await readImageWorkspaceIdentity(tx, aggregateId);
  if (previous?.retired) return;
  await tx.objectStore(IMAGE_WORKSPACE_IDENTITIES_STORE).put({
    version: 1,
    aggregateId,
    generation: previous?.generation ?? crypto.randomUUID(),
    retired: true,
    ...(retiredRevision === undefined ? {} : { retiredRevision }),
  });
}
