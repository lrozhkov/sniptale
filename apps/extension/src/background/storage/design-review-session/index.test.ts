import { expect, it, vi } from 'vitest';
import {
  DesignReviewSessionStorage,
  DESIGN_REVIEW_SESSION_STORAGE_KEY,
  DESIGN_REVIEW_SESSION_BINDINGS_KEY,
} from './index';
import { runWithPersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import {
  DESIGN_REVIEW_SESSION_MAX_BYTES,
  parseDesignReviewSessionRequest,
  parseDesignReviewSessionReply,
} from '../../../contracts/design-review-session';
function area(initial: Record<string, unknown> = {}) {
  let data = structuredClone(initial);
  return {
    get: vi.fn(async () => structuredClone(data)),
    set: vi.fn(async (next: Record<string, unknown>) => {
      data = { ...data, ...structuredClone(next) };
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  };
}
it('keeps reads write-free and validates stored records and duplicate native bindings', async () => {
  const local = area();
  const session = area();
  const storage = new DesignReviewSessionStorage(local, session);
  expect(await storage.read()).toEqual({ entries: [], tabs: [] });
  expect(local.set).not.toHaveBeenCalled();
  expect(session.set).not.toHaveBeenCalled();
  const id = crypto.randomUUID();
  await runWithPersistenceMutationPermit(async (permit) => {
    await storage.writeEntries([{ id, revision: 1, payload: 'retained' }], permit);
    await storage.writeBindings([{ tabId: 1, id }], permit);
  });
  expect((await storage.read()).entries[0]?.payload).toBe('retained');
  const malformed = new DesignReviewSessionStorage(
    area({ [DESIGN_REVIEW_SESSION_STORAGE_KEY]: { version: 99 } }),
    session
  );
  await expect(malformed.read()).rejects.toThrow();
  const duplicates = new DesignReviewSessionStorage(
    local,
    area({
      [DESIGN_REVIEW_SESSION_BINDINGS_KEY]: {
        version: 1,
        tabs: [
          { tabId: 1, id },
          { tabId: 2, id },
        ],
      },
    })
  );
  await expect(duplicates.read()).rejects.toThrow('Invalid Design Review session identities');
});
it('parses only bounded opaque payloads and exact request and reply shapes', () => {
  const requestId = crypto.randomUUID();
  const lease = crypto.randomUUID();
  const save = { requestId, kind: 'save', lease, expectedRevision: 0, payload: '' };
  expect(parseDesignReviewSessionRequest(save)).toEqual(save);
  expect(parseDesignReviewSessionRequest({ ...save, tabId: 2 })).toBeNull();
  expect(parseDesignReviewSessionRequest({ ...save, expectedRevision: -1 })).toBeNull();
  expect(
    parseDesignReviewSessionRequest({
      ...save,
      payload: '😀'.repeat(DESIGN_REVIEW_SESSION_MAX_BYTES / 4 + 1),
    })
  ).toBeNull();
  expect(
    parseDesignReviewSessionRequest({
      ...save,
      payload: 'a'.repeat(DESIGN_REVIEW_SESSION_MAX_BYTES),
    })
  ).not.toBeNull();
  expect(
    parseDesignReviewSessionReply({
      requestId,
      status: 'ready',
      lease,
      revision: 0,
      available: false,
    })
  ).not.toBeNull();
  expect(
    parseDesignReviewSessionReply({
      requestId,
      status: 'ready',
      lease,
      revision: -1,
      available: false,
    })
  ).toBeNull();
});
