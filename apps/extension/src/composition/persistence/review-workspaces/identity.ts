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
    put(value: { key: string; generation: string }): Promise<unknown>;
  };
}

/** Missing rows identify an original with no known restore, or an unused project ID. */
export async function readVideoReviewIdentity(
  tx: IdentityReader,
  kind: VideoReviewIdentityKind,
  id: string
): Promise<string | null> {
  const key = JSON.stringify([kind, id]);
  const value = await tx.objectStore(VIDEO_REVIEW_IDENTITIES_STORE).get(key);
  if (value === undefined) return null;
  if (
    !isPlainRecord(value) ||
    value['key'] !== key ||
    typeof value['generation'] !== 'string' ||
    !value['generation'] ||
    value['generation'].length > 200
  )
    throw new Error('Invalid Quick Edit lifetime.');
  return value['generation'];
}

/** Advance a restored source or retire a project in the same transaction as its lifecycle change. */
export async function fenceVideoReviewIdentity(
  tx: IdentityWriter,
  kind: VideoReviewIdentityKind,
  id: string
): Promise<void> {
  await tx.objectStore(VIDEO_REVIEW_IDENTITIES_STORE).put({
    key: JSON.stringify([kind, id]),
    generation: crypto.randomUUID(),
  });
}
