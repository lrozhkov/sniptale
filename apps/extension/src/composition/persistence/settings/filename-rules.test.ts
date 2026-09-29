import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../infrastructure/browser-storage', () => ({ browserStorage: { sync: storage } }));
import { loadSettings, patchSettings, resetSettingsToDefaults } from './index';
import { parseStoredSettings } from './guards';
beforeEach(() => {
  vi.clearAllMocks();
  storage.get.mockResolvedValue({});
  storage.set.mockResolvedValue(undefined);
});
it('reads old preferences without writing and uses an absent standard rule', async () => {
  expect((await loadSettings()).filenameRules).toBeUndefined();
  expect(storage.set).not.toHaveBeenCalled();
});
it('persists valid rules and retains the authoritative previous value after write failure', async () => {
  const filenameRules = { template: 'Project_{type}', images: 'Shot_{index}' };
  await patchSettings({ filenameRules });
  expect(storage.set).toHaveBeenCalledWith(
    {
      sniptale_settings: expect.objectContaining({ filenameRules }),
    },
    expect.anything()
  );
  storage.get.mockResolvedValue({ sniptale_settings: { filenameRules } });
  storage.set.mockRejectedValueOnce(new Error('storage full'));
  await expect(patchSettings({ filenameRules: { template: 'new' } })).rejects.toThrow(
    'storage full'
  );
  expect((await loadSettings()).filenameRules).toEqual(filenameRules);
  await resetSettingsToDefaults();
  expect(storage.set).toHaveBeenLastCalledWith(
    {
      sniptale_settings: expect.not.objectContaining({ filenameRules }),
    },
    expect.anything()
  );
});
it('rejects invalid mutations and records hostile stored rules without repair', async () => {
  await expect(patchSettings({ filenameRules: { template: '{execute}' } })).rejects.toThrow(
    'Filename rules are invalid'
  );
  expect(storage.set).not.toHaveBeenCalled();
  expect(
    parseStoredSettings({ filenameRules: { template: 'ok', recordings: 123 } }).invalidFieldCount
  ).toBe(1);
});

it('carries corrupted stored rules through loading to deterministic fallback without read repair', async () => {
  storage.get.mockResolvedValue({
    sniptale_settings: { filenameRules: { template: 'common', images: '{broken}' } },
  });
  const { createFilenameSession, createOutputFilename } =
    await import('../../../workflows/file-naming');
  const session = await createFilenameSession('stored-corruption');
  expect(session.rules).toBeNull();
  const request = { category: 'images' as const, type: 'screenshot', extension: 'png' };
  const filename = await createOutputFilename(request, session);
  expect(filename).toMatch(/^Sniptale_screenshot_.*Z_stored-corruption_1\.png$/);
  expect(await createOutputFilename(request, session)).toBe(filename);
  expect(storage.set).not.toHaveBeenCalled();
  await patchSettings({ imageQuality: 85 });
  expect(storage.set).toHaveBeenCalledWith(
    {
      sniptale_settings: expect.objectContaining({ imageQuality: 85, filenameRules: null }),
    },
    expect.anything()
  );
});
