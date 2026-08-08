import { beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  isAvailable: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({ browserStorage: { session: storage } }));

import {
  clearAnnotationForkSessionPayload,
  createAnnotationForkSessionStorageKey,
  readAnnotationForkSessionRecord,
  writeAnnotationForkSessionRecord,
} from './annotation-fork';

const EMPTY_DRAFT_PAYLOAD = JSON.stringify({ drafts: {}, version: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  storage.get.mockResolvedValue({});
  storage.isAvailable.mockReturnValue(true);
  storage.remove.mockResolvedValue(undefined);
  storage.set.mockResolvedValue(undefined);
});

it('keeps annotation fork drafts isolated by tab identity', async () => {
  storage.get.mockResolvedValueOnce({
    'sniptale.annotation-fork-drafts:tab:7': { payload: EMPTY_DRAFT_PAYLOAD, revision: 3 },
  });

  await expect(readAnnotationForkSessionRecord(7)).resolves.toEqual({
    payload: EMPTY_DRAFT_PAYLOAD,
    revision: 3,
  });
  await writeAnnotationForkSessionRecord(8, { payload: EMPTY_DRAFT_PAYLOAD, revision: 4 });

  expect(createAnnotationForkSessionStorageKey(7)).toBe('sniptale.annotation-fork-drafts:tab:7');
  expect(storage.set).toHaveBeenCalledWith({
    'sniptale.annotation-fork-drafts:tab:8': { payload: EMPTY_DRAFT_PAYLOAD, revision: 4 },
  });
});

it('removes only the closed tab draft and ignores invalid stored payloads', async () => {
  storage.get.mockResolvedValueOnce({ 'sniptale.annotation-fork-drafts:tab:7': 42 });

  await expect(readAnnotationForkSessionRecord(7)).resolves.toEqual({
    payload: null,
    revision: 0,
  });
  await clearAnnotationForkSessionPayload(7);

  expect(storage.remove).toHaveBeenCalledWith(['sniptale.annotation-fork-drafts:tab:7']);
});

it('rejects non-canonical payloads instead of retaining opaque content strings', async () => {
  await expect(
    writeAnnotationForkSessionRecord(7, {
      payload: JSON.stringify({ drafts: {}, secret: 'page text', version: 1 }),
      revision: 1,
    })
  ).rejects.toThrow('Invalid annotation fork session payload');
  expect(storage.set).not.toHaveBeenCalled();
});
