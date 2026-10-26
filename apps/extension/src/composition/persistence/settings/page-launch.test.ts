import { beforeEach, expect, it, vi } from 'vitest';
import { normalizePageLaunchPreferences } from '../../../contracts/page-launch';
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: { get: mocks.get, set: mocks.set, remove: mocks.remove },
    local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() },
  },
}));
import {
  createDefaultSettings,
  patchSettings,
  patchPageLaunchCorner,
  resetSettingsToDefaults,
} from './index';
import { parseStoredSettings } from './guards';
let stored: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  stored = { sniptale_settings: createDefaultSettings() };
  mocks.get.mockImplementation(async () => ({ ...stored }));
  mocks.set.mockImplementation(async (value: Record<string, unknown>) => {
    Object.assign(stored, value);
  });
  mocks.remove.mockImplementation(async (keys: string[]) => {
    for (const key of keys) delete stored[key];
  });
});
it('merges parallel page-launch preferences without losing independent fields', async () => {
  const [first, second, corner] = await Promise.all([
    patchSettings({ pageLaunch: { enabled: true, quickActionsPopup: false } }),
    patchSettings({ pageLaunch: { hoverOnly: true, quickActionsCorner: true } }),
    patchPageLaunchCorner('top-left', () => true),
  ]);
  expect(first.pageLaunch).toMatchObject({ enabled: true, quickActionsPopup: false });
  expect(second.pageLaunch).toMatchObject({
    enabled: true,
    hoverOnly: true,
    quickActionsCorner: true,
  });
  expect(corner.pageLaunch).toEqual({
    enabled: true,
    hoverOnly: true,
    corner: 'top-left',
    quickActionsPopup: false,
    quickActionsCorner: true,
    quickActionsToolbar: false,
  });
});
it('refuses a queued corner after erasure without recreating settings', async () => {
  let finish!: (value: Record<string, unknown>) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const read = new Promise<Record<string, unknown>>((resolve) => {
    finish = resolve;
  });
  mocks.get.mockImplementationOnce(() => {
    entered();
    return read;
  });
  let current = true;
  const pending = patchPageLaunchCorner('top-left', () => current);
  await started;
  current = false;
  stored = {};
  finish({ sniptale_settings: createDefaultSettings() });
  await expect(pending).rejects.toThrow('no longer current');
  expect(mocks.set).not.toHaveBeenCalled();
  expect(stored).toEqual({});
});
it('reset preserves defaults until a new explicit corner command', async () => {
  await patchSettings({ pageLaunch: { enabled: true, corner: 'top-left' } });
  const reset = await resetSettingsToDefaults();
  expect(reset.pageLaunch).toBeUndefined();
  expect(normalizePageLaunchPreferences(reset.pageLaunch).corner).toBe('bottom-right');
  const next = await patchPageLaunchCorner('bottom-left', () => true);
  expect(next.pageLaunch).toMatchObject({ enabled: false, corner: 'bottom-left' });
});
it('preserves an accepted preference on write refusal and permits an explicit retry', async () => {
  await patchPageLaunchCorner('top-right', () => true);
  mocks.set.mockRejectedValueOnce(new Error('storage refused'));
  await expect(patchPageLaunchCorner('top-left', () => true)).rejects.toThrow('storage refused');
  const accepted = parseStoredSettings(stored['sniptale_settings']);
  expect(accepted.value.pageLaunch?.corner).toBe('top-right');
  await expect(patchPageLaunchCorner('bottom-left', () => true)).resolves.toMatchObject({
    pageLaunch: { corner: 'bottom-left' },
  });
});
it('parses optional launch preferences without writing during admission', () => {
  expect(parseStoredSettings({}).value.pageLaunch).toBeUndefined();
  expect(parseStoredSettings({ pageLaunch: { enabled: 'yes' } }).invalidFieldCount).toBeGreaterThan(
    0
  );
  expect(parseStoredSettings({ pageLaunch: { enabled: true } }).value.pageLaunch?.enabled).toBe(
    true
  );
  expect(mocks.set).not.toHaveBeenCalled();
});
