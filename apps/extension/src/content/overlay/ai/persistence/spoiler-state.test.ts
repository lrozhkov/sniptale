import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));
vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import { loadSpoilerState, saveSpoilerState } from './spoiler-state';

beforeEach(() => vi.clearAllMocks());

it('loads, validates and fail-soft persists content AI spoiler state', async () => {
  getMock
    .mockResolvedValueOnce({ sniptale_ai_modal_spoiler_open: true })
    .mockRejectedValueOnce(new Error('unavailable'));
  setMock.mockRejectedValueOnce(new Error('quota'));

  await expect(loadSpoilerState()).resolves.toBe(true);
  await expect(loadSpoilerState()).resolves.toBe(false);
  await expect(saveSpoilerState(false)).resolves.toBeUndefined();
});
