import { beforeEach, expect, it, vi } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';

const state = vi.hoisted(() => ({
  listener: null as
    | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
    | null,
  stored: undefined as unknown,
}));
const mocks = vi.hoisted(() => ({
  get: vi.fn(async () =>
    state.stored === undefined ? {} : { sniptale_step_badge_presets: state.stored }
  ),
  set: vi.fn(async (values: Record<string, unknown>) => {
    state.stored = values['sniptale_step_badge_presets'];
  }),
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: () => true,
    subscribeToChanges: vi.fn((listener) => {
      state.listener = listener;
      return () => {
        state.listener = null;
      };
    }),
    sync: { get: mocks.get, set: mocks.set },
  },
}));

beforeEach(() => {
  state.listener = null;
  state.stored = undefined;
  vi.clearAllMocks();
});

it('migrates, serializes concurrent CRUD, and protects systems', async () => {
  const owner = await import('./index');
  await expect(owner.migrateStepBadgeSystemPresetCatalog()).resolves.toBe(true);
  const settings = createSystemStepBadgePresetCatalog()[0]!.settings;
  const [first, second] = await Promise.all([
    owner.createUserStepBadgePreset({ name: 'First', settings }),
    owner.createUserStepBadgePreset({ name: 'Second', settings }),
  ]);
  expect([first.outcome, second.outcome]).toEqual(['applied', 'applied']);
  expect(
    (await owner.loadStepBadgePresetCatalog()).presets.filter((preset) => preset.origin === 'user')
  ).toHaveLength(2);
  await expect(owner.deleteStoredStepBadgePreset('system-classic')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'system-delete',
  });
});

it('rejects malformed or future storage without overwriting it', async () => {
  const owner = await import('./index');
  state.stored = { schemaVersion: 99 };
  await expect(owner.setDefaultStoredStepBadgePreset('system-outline')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'unsafe-storage',
  });
  expect(mocks.set).not.toHaveBeenCalled();
});

it('rejects negative and fractional catalog metadata without overwriting storage', async () => {
  const owner = await import('./index');
  for (const malformed of [{ schemaVersion: -1 }, { systemCatalogRevision: 0.5 }]) {
    state.stored = malformed;
    mocks.set.mockClear();
    await expect(owner.setDefaultStoredStepBadgePreset('system-outline')).resolves.toEqual({
      outcome: 'rejected',
      reason: 'unsafe-storage',
    });
    expect(mocks.set).not.toHaveBeenCalled();
  }
});

it('keeps cached state on failed writes and ignores unsafe subscription values', async () => {
  const owner = await import('./index');
  const before = await owner.loadStepBadgePresetCatalog();
  mocks.set.mockRejectedValueOnce(new Error('sync failed'));
  await expect(
    owner.createUserStepBadgePreset({
      name: 'Retry',
      settings: createSystemStepBadgePresetCatalog()[0]!.settings,
    })
  ).rejects.toThrow('sync failed');
  expect(owner.getLoadedStepBadgePresetCatalogSnapshot()).toEqual(before);
  const listener = vi.fn();
  owner.subscribeToStepBadgePresetCatalog(listener);
  state.listener?.({ sniptale_step_badge_presets: { newValue: { schemaVersion: 99 } } }, 'sync');
  expect(listener).not.toHaveBeenCalled();
});

it('rejects invalid and missing mutations without writes', async () => {
  const owner = await import('./index');
  const settings = createSystemStepBadgePresetCatalog()[0]!.settings;
  await expect(owner.createUserStepBadgePreset({ name: ' ', settings })).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  for (const customCss of [
    '[badge]\nposition: fixed;',
    '[badge]\nbackground: src("https://example.com/tracker.png");',
  ]) {
    await expect(
      owner.createUserStepBadgePreset({
        name: 'Unsafe CSS',
        settings: { ...settings, style: { ...settings.style, customCss } },
      })
    ).resolves.toEqual({ outcome: 'rejected', reason: 'invalid-input' });
  }
  await expect(owner.setStoredStepBadgePresetEnabled('missing', true)).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(owner.setDefaultStoredStepBadgePreset('missing')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  expect(mocks.set).not.toHaveBeenCalled();
});

it('covers unchanged, ordering, disabled-default, update, reset, and deletion decisions', async () => {
  const owner = await import('./index');
  const settings = createSystemStepBadgePresetCatalog()[0]!.settings;
  await owner.migrateStepBadgeSystemPresetCatalog();
  await expect(owner.setDefaultStoredStepBadgePreset('system-classic')).resolves.toEqual({
    outcome: 'unchanged',
  });
  await expect(owner.setStoredStepBadgePresetEnabled('system-outline', true)).resolves.toEqual({
    outcome: 'unchanged',
  });
  await expect(owner.setStoredStepBadgePresetEnabled('system-outline', false)).resolves.toEqual({
    outcome: 'applied',
  });
  await expect(owner.setDefaultStoredStepBadgePreset('system-outline')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'disabled-default',
  });
  await expect(
    owner.updateStoredStepBadgePreset({ id: 'missing', name: 'Missing', settings })
  ).resolves.toEqual({ outcome: 'rejected', reason: 'not-found' });
  await expect(
    owner.updateStoredStepBadgePreset({ id: 'system-classic', name: 'Changed', settings })
  ).resolves.toEqual({ outcome: 'applied' });
  await expect(owner.resetStoredSystemStepBadgePreset('system-classic')).resolves.toEqual({
    outcome: 'applied',
  });
  await expect(owner.resetStoredSystemStepBadgePreset('system-classic')).resolves.toEqual({
    outcome: 'unchanged',
  });
  await expect(owner.resetStoredSystemStepBadgePreset('missing')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(owner.deleteStoredStepBadgePreset('missing')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  const ids = (await owner.loadStepBadgePresetCatalog()).presets.map((preset) => preset.id);
  await expect(owner.updateStoredStepBadgePresetOrder([...ids].reverse())).resolves.toEqual({
    outcome: 'applied',
  });
  await expect(owner.updateStoredStepBadgePresetOrder(['missing'])).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
});

it('ignores unrelated subscriptions and prevents stale reads from replacing a newer snapshot', async () => {
  const owner = await import('./index');
  const listener = vi.fn();
  owner.subscribeToStepBadgePresetCatalog(listener);
  state.listener?.({ other: { newValue: {} } }, 'sync');
  state.listener?.({ sniptale_step_badge_presets: { newValue: {} } }, 'local');
  expect(listener).not.toHaveBeenCalled();

  let resolveGet: ((value: Record<string, unknown>) => void) | undefined;
  mocks.get.mockImplementationOnce(() => new Promise((resolve) => (resolveGet = resolve)));
  const pending = owner.loadStepBadgePresetCatalog();
  state.listener?.({ sniptale_step_badge_presets: { newValue: undefined } }, 'sync');
  resolveGet?.({});
  await expect(pending).resolves.toEqual(owner.getLoadedStepBadgePresetCatalogSnapshot());
  expect(listener).toHaveBeenCalledOnce();
});
