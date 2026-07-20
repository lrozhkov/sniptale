import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import { loadRecentCommandPaletteActionIds, saveRecentCommandPaletteActionIds } from './index';

beforeEach(() => vi.clearAllMocks());

it('bounds command palette recents and remains fail-soft', async () => {
  getMock.mockResolvedValue({ recents: ['one', 2, 'three'] });
  setMock.mockRejectedValue(new Error('quota'));

  await expect(loadRecentCommandPaletteActionIds('recents')).resolves.toEqual(['one', 'three']);
  await expect(
    saveRecentCommandPaletteActionIds('recents', ['one', 'two', 'three', 'four', 'five', 'six'])
  ).resolves.toBeUndefined();
  expect(setMock).toHaveBeenCalledWith({
    recents: ['one', 'two', 'three', 'four', 'five'],
  });
});

it('treats missing keys, invalid roots, and failed reads as empty recents', async () => {
  getMock.mockResolvedValueOnce({ recents: null }).mockRejectedValueOnce(new Error('unavailable'));

  await expect(loadRecentCommandPaletteActionIds()).resolves.toEqual([]);
  await expect(loadRecentCommandPaletteActionIds('recents')).resolves.toEqual([]);
  await expect(loadRecentCommandPaletteActionIds('recents')).resolves.toEqual([]);
  await expect(saveRecentCommandPaletteActionIds(undefined, ['one'])).resolves.toBeUndefined();
  expect(setMock).not.toHaveBeenCalled();
});
