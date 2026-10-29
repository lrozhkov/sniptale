import { expect, it } from 'vitest';
import type { IDBPTransaction } from 'idb';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { VIDEO_PROJECT_REVISIONS_STORE } from '../infrastructure/indexed-db/core.stores';
import {
  allocateVideoProjectRevisionInTransaction,
  retainVideoProjectRevisionInTransaction,
} from './revisions';

function fixture(fail: () => boolean = () => false) {
  const native = createReviewWorkspaceStoreFixture(fail);
  return {
    ...native,
    transaction: () =>
      native.database.transaction(
        [VIDEO_PROJECT_REVISIONS_STORE],
        'readwrite'
      ) as unknown as IDBPTransaction<unknown, string[], 'readwrite'>,
  };
}

it('allocates from the current native revision and retains it across deletion', async () => {
  const db = fixture();
  const first = db.transaction();
  expect(await allocateVideoProjectRevisionInTransaction(first, 'project', 7)).toBe(8);
  await first.done;
  const retired = db.transaction();
  // An in-place cascade can have advanced the live revision since the last allocation.
  await retainVideoProjectRevisionInTransaction(retired, 'project', 12);
  await retired.done;
  const recreated = db.transaction();
  expect(await allocateVideoProjectRevisionInTransaction(recreated, 'project', 0)).toBe(13);
  await recreated.done;
});
it('does not consume a token after the domain transaction aborts', async () => {
  const db = fixture();
  const failed = db.transaction();
  expect(await allocateVideoProjectRevisionInTransaction(failed, 'project', 0)).toBe(1);
  failed.abort();
  await failed.done.catch(() => undefined);
  const retry = db.transaction();
  expect(await allocateVideoProjectRevisionInTransaction(retry, 'project', 0)).toBe(1);
  await retry.done;
});
it('refuses corrupt and exhausted counters instead of resetting local admission', async () => {
  const db = fixture();
  db.rows
    .get(VIDEO_PROJECT_REVISIONS_STORE)!
    .set('project', { version: 1, projectId: 'project', revision: Number.MAX_SAFE_INTEGER });
  const exhausted = db.transaction();
  await expect(allocateVideoProjectRevisionInTransaction(exhausted, 'project', 1)).rejects.toThrow(
    'exhausted'
  );
  exhausted.abort();
  await exhausted.done.catch(() => undefined);
  db.rows
    .get(VIDEO_PROJECT_REVISIONS_STORE)!
    .set('project', { version: 2, projectId: 'project', revision: 1 });
  const corrupt = db.transaction();
  await expect(allocateVideoProjectRevisionInTransaction(corrupt, 'project', 1)).rejects.toThrow(
    'Invalid retained'
  );
  corrupt.abort();
  await corrupt.done.catch(() => undefined);
});
