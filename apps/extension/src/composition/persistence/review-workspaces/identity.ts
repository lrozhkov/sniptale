import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { VIDEO_REVIEW_IDENTITIES_STORE } from '../infrastructure/indexed-db/core.stores';

type VideoReviewIdentityKind = 'original' | 'retired-project';

interface IdentityReader {
  objectStore(name: typeof VIDEO_REVIEW_IDENTITIES_STORE): {
    get(key: string): Promise<unknown>;
  };
}

interface IdentityWriter {
  objectStore(name: typeof VIDEO_REVIEW_IDENTITIES_STORE): {
    put(value: VideoReviewIdentity): Promise<unknown>;
  };
}

interface VideoReviewIdentity {
  key: string;
  generation: string;
  retiredRevision?: number;
}

async function readIdentity(
  tx: IdentityReader,
  kind: VideoReviewIdentityKind,
  id: string
): Promise<VideoReviewIdentity | null> {
  const key = JSON.stringify([kind, id]);
  const value = await tx.objectStore(VIDEO_REVIEW_IDENTITIES_STORE).get(key);
  if (value === undefined) return null;
  if (
    !isPlainRecord(value) ||
    value['key'] !== key ||
    typeof value['generation'] !== 'string' ||
    !value['generation'].length ||
    value['generation'].length > 200
  )
    throw new Error('Invalid Quick Edit lifetime.');
  const retiredRevision = value['retiredRevision'];
  if (
    retiredRevision !== undefined &&
    (kind !== 'retired-project' ||
      typeof retiredRevision !== 'number' ||
      !Number.isSafeInteger(retiredRevision) ||
      retiredRevision < 1)
  )
    throw new Error('Invalid Quick Edit retired revision.');
  return {
    key,
    generation: value['generation'],
    ...(retiredRevision === undefined ? {} : { retiredRevision }),
  };
}

/** Missing rows identify an original with no known restore, or an unused project ID. */
export async function readVideoReviewIdentity(
  tx: IdentityReader,
  kind: VideoReviewIdentityKind,
  id: string
): Promise<string | null> {
  return (await readIdentity(tx, kind, id))?.generation ?? null;
}

export async function readVideoReviewRetiredRevision(
  tx: IdentityReader,
  id: string
): Promise<number> {
  return (await readIdentity(tx, 'retired-project', id))?.retiredRevision ?? 0;
}

/** Advance a restored source or retire a project in the same transaction as its lifecycle change. */
export async function fenceVideoReviewIdentity(
  tx: IdentityWriter,
  kind: VideoReviewIdentityKind,
  id: string,
  retiredRevision?: number
): Promise<void> {
  await tx.objectStore(VIDEO_REVIEW_IDENTITIES_STORE).put({
    key: JSON.stringify([kind, id]),
    generation: crypto.randomUUID(),
    ...(retiredRevision === undefined ? {} : { retiredRevision }),
  });
}
