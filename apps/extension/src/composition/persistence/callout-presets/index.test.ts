import { beforeEach, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';

const placement = { anchor: 'top-center', side: 'top' } as const;

const state = vi.hoisted(() => ({
  changeListener: null as
    | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
    | null,
  observe: false,
  stored: undefined as unknown,
}));
const mocks = vi.hoisted(() => ({
  get: vi.fn(async () =>
    state.stored === undefined ? {} : { sniptale_callout_presets: state.stored }
  ),
  set: vi.fn(async (values: Record<string, unknown>) => {
    state.stored = values['sniptale_callout_presets'];
  }),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: () => state.observe,
    subscribeToChanges: vi.fn(
      (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) => {
        state.changeListener = listener;
        return () => {
          state.changeListener = null;
        };
      }
    ),
    sync: { get: mocks.get, set: mocks.set },
  },
}));

beforeEach(() => {
  state.changeListener = null;
  state.observe = false;
  state.stored = undefined;
  vi.clearAllMocks();
});

it('migrates once and supports committed CRUD invariants', async () => {
  const owner = await import('./index');
  await expect(owner.migrateCalloutSystemPresetCatalog()).resolves.toBe(true);
  await expect(owner.migrateCalloutSystemPresetCatalog()).resolves.toBe(false);

  const created = await owner.createUserCalloutPreset({
    name: 'My note',
    placement,
    style: createSystemCalloutPresetCatalog()[0]!.style,
  });
  expect(created).toMatchObject({ outcome: 'applied' });
  expect(created.id).toMatch(/^user-/);
  await expect(owner.setDefaultCalloutPreset(created.id!)).resolves.toMatchObject({
    outcome: 'applied',
  });
  await expect(
    owner.updateCalloutSessionDefaults({ enabled: true, templateSource: 'forced' })
  ).resolves.toMatchObject({ outcome: 'applied' });
  await expect(owner.deleteCalloutPreset('system-callout-bubble')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'system-delete',
  });
  const loaded = await owner.loadCalloutPresetCatalog();
  expect(loaded.defaultPresetId).toBe(created.id);
  expect(loaded.newSessionDefaults).toEqual({ enabled: true, templateSource: 'forced' });
});

it('serializes concurrent commands and re-reads the latest committed value', async () => {
  const owner = await import('./index');
  await owner.migrateCalloutSystemPresetCatalog();
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const [first, second] = await Promise.all([
    owner.createUserCalloutPreset({ name: 'First', placement, style }),
    owner.createUserCalloutPreset({ name: 'Second', placement, style }),
  ]);
  expect(first.outcome).toBe('applied');
  expect(second.outcome).toBe('applied');
  const loaded = await owner.loadCalloutPresetCatalog();
  expect(
    loaded.presets.filter((preset) => preset.origin === 'user').map((preset) => preset.name)
  ).toEqual(['First', 'Second']);
});

it('does not overwrite malformed or future storage', async () => {
  const owner = await import('./index');
  state.stored = { schemaVersion: 99 };
  await expect(owner.setDefaultCalloutPreset('system-callout-card')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'unsafe-storage',
  });
  expect(mocks.set).not.toHaveBeenCalled();
});

it('does not overwrite storage with malformed connector attachments', async () => {
  const owner = await import('./index');
  const preset = createSystemCalloutPresetCatalog()[0]!;
  state.stored = {
    userPresets: [
      {
        id: 'user-malformed-attachment',
        name: 'Malformed attachment',
        placement: {
          ...preset.placement,
          connectorAttachments: { block: { mode: 'unknown' }, frame: { mode: 'auto' } },
        },
        style: preset.style,
      },
    ],
  };

  await expect(owner.setDefaultCalloutPreset('system-callout-card')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'unsafe-storage',
  });
  expect(mocks.set).not.toHaveBeenCalled();
});

it('keeps the cached snapshot unchanged on write failure and allows a retry', async () => {
  const owner = await import('./index');
  const before = await owner.loadCalloutPresetCatalog();
  mocks.set.mockRejectedValueOnce(new Error('sync failed'));
  const input = {
    name: 'Retry me',
    placement,
    style: createSystemCalloutPresetCatalog()[0]!.style,
  };
  await expect(owner.createUserCalloutPreset(input)).rejects.toThrow('sync failed');
  expect(owner.getLoadedCalloutPresetCatalogSnapshot()).toEqual(before);
  await expect(owner.createUserCalloutPreset(input)).resolves.toMatchObject({ outcome: 'applied' });
});

it('rejects an invalid style before committing it', async () => {
  const owner = await import('./index');
  const before = await owner.loadCalloutPresetCatalog();
  const source = createSystemCalloutPresetCatalog()[0]!.style;
  const result = await owner.createUserCalloutPreset({
    name: 'Too large',
    placement,
    style: {
      ...source,
      surface: { ...source.surface, fillPaint: { kind: 'solid', color: '#'.padEnd(8_000, 'f') } },
    },
  });
  expect(result).toEqual({ outcome: 'rejected', reason: 'invalid-input' });
  expect(mocks.set).not.toHaveBeenCalled();
  expect(owner.getLoadedCalloutPresetCatalogSnapshot()).toEqual(before);
});

it('emits only exact sync-key changes as resolved deep clones', async () => {
  const owner = await import('./index');
  state.observe = true;
  const listener = vi.fn();
  const unsubscribe = owner.subscribeToCalloutPresetCatalog(listener);
  state.changeListener?.({ sniptale_callout_presets: { newValue: undefined } }, 'local');
  expect(listener).not.toHaveBeenCalled();
  state.changeListener?.({ sniptale_callout_presets: { newValue: undefined } }, 'sync');
  expect(listener).toHaveBeenCalledOnce();
  const catalog = listener.mock.calls[0]![0];
  catalog.presets[0].style.surface.radius = 99;
  expect(owner.getLoadedCalloutPresetCatalogSnapshot()?.presets[0]?.style.surface.radius).toBe(8);
  unsubscribe();
  expect(state.changeListener).toBeNull();
});

it('does not return or cache an older read after a subscription snapshot', async () => {
  const owner = await import('./index');
  const { serializeCalloutPresetCatalog } = await import('./migration');
  state.observe = true;
  const listener = vi.fn();
  const unsubscribe = owner.subscribeToCalloutPresetCatalog(listener);
  const stale = {
    catalogCustomized: false,
    defaultPresetId: 'system-callout-bubble',
    presets: createSystemCalloutPresetCatalog(),
    systemCatalogRevision: 1,
  };
  const fresh = { ...stale, defaultPresetId: 'system-callout-card' };
  let resolveRead: ((value: Record<string, unknown>) => void) | undefined;
  mocks.get.mockImplementationOnce(() => new Promise((resolve) => (resolveRead = resolve)));

  const pending = owner.loadCalloutPresetCatalog();
  state.changeListener?.(
    {
      sniptale_callout_presets: { newValue: serializeCalloutPresetCatalog(fresh) },
    },
    'sync'
  );
  resolveRead?.({ sniptale_callout_presets: serializeCalloutPresetCatalog(stale) });

  await expect(pending).resolves.toMatchObject({ defaultPresetId: 'system-callout-card' });
  expect(owner.getLoadedCalloutPresetCatalogSnapshot()).toMatchObject({
    defaultPresetId: 'system-callout-card',
  });
  unsubscribe();
});

it('rejects invalid inputs and missing preset commands without writing', async () => {
  const owner = await import('./index');
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  await expect(owner.createUserCalloutPreset({ name: ' ', placement, style })).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  await expect(
    owner.updateCalloutPreset({ id: 'missing', name: 'Missing', placement, style })
  ).resolves.toEqual({ outcome: 'rejected', reason: 'not-found' });
  await expect(owner.deleteCalloutPreset('missing')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(owner.setDefaultCalloutPreset('missing')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(owner.setCalloutPresetEnabled('missing', true)).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(owner.resetSystemCalloutPreset('missing')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'not-found',
  });
  await expect(owner.updateCalloutPresetsOrder(['x', 'x'])).resolves.toEqual({
    outcome: 'rejected',
    reason: 'invalid-input',
  });
  expect(mocks.set).not.toHaveBeenCalled();
});

it('reports unchanged commands and protects disabled/default catalog invariants', async () => {
  const owner = await import('./index');
  await owner.migrateCalloutSystemPresetCatalog();
  await expect(owner.setDefaultCalloutPreset('system-callout-bubble')).resolves.toMatchObject({
    outcome: 'unchanged',
  });
  await expect(owner.setCalloutPresetEnabled('system-callout-card', true)).resolves.toMatchObject({
    outcome: 'unchanged',
  });
  await owner.setCalloutPresetEnabled('system-callout-card', false);
  await expect(owner.setDefaultCalloutPreset('system-callout-card')).resolves.toEqual({
    outcome: 'rejected',
    reason: 'disabled-default',
  });
  await expect(owner.resetSystemCalloutPreset('system-callout-bubble')).resolves.toMatchObject({
    outcome: 'unchanged',
  });
});

it('enforces the user preset count limit', async () => {
  const owner = await import('./index');
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  state.stored = {
    schemaVersion: 1,
    systemCatalogRevision: 1,
    userPresets: Array.from({ length: 16 }, (_, index) => ({
      id: `user-${index}`,
      name: `Preset ${index}`,
      style,
    })),
  };
  await expect(
    owner.createUserCalloutPreset({ name: 'Overflow', placement, style })
  ).resolves.toEqual({
    outcome: 'rejected',
    reason: 'limit',
  });
});
