import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../features/highlighter/contracts';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';

const storageState = vi.hoisted(() => ({ value: undefined as unknown }));
const { syncGetMock, syncSetMock, translateMock } = vi.hoisted(() => ({
  syncGetMock: vi.fn(async () =>
    storageState.value === undefined ? {} : { sniptale_highlighter_settings: storageState.value }
  ),
  syncSetMock: vi.fn(async (payload: Record<string, unknown>) => {
    storageState.value = payload['sniptale_highlighter_settings'];
  }),
  translateMock: vi.fn((key: string) =>
    key === 'highlighter.systemPresets.accent' ? 'Accent' : key
  ),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    sync: { get: syncGetMock, set: syncSetMock },
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

function cloneSettings(settings: HighlighterSettings): HighlighterSettings {
  return {
    ...settings,
    borderPresets: settings.borderPresets.map((preset) => ({
      ...preset,
      padding: { ...preset.padding },
    })),
    defaultBlurSettings: { ...settings.defaultBlurSettings },
    defaultFocusSettings: { ...settings.defaultFocusSettings },
  };
}

function createUserPreset(
  id: string,
  overrides: Pick<BorderPreset, 'order'> | undefined = undefined
): BorderPreset {
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    systemPresetKey: _systemPresetKey,
    ...base
  } = createDefaultHighlighterSettings().borderPresets[0]!;
  return {
    ...base,
    id,
    name: `Preset ${id}`,
    origin: 'user',
    ...(overrides ?? {}),
  };
}

function seed(settings: HighlighterSettings = createDefaultHighlighterSettings()) {
  storageState.value = cloneSettings(settings);
}

async function loadHighlighterStorage() {
  return import('./index');
}

describe('highlighter persistence owner', () => {
  beforeEach(() => {
    storageState.value = undefined;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('hydrates the complete catalog without write-on-read', async () => {
    const module = await loadHighlighterStorage();

    await expect(module.loadHighlighterSettings()).resolves.toEqual(
      module.DEFAULT_HIGHLIGHTER_SETTINGS
    );
    expect(syncSetMock).not.toHaveBeenCalled();
  });

  it('adds and updates user presets through latest persisted state', async () => {
    seed();
    const module = await loadHighlighterStorage();
    const user = createUserPreset('user-1');

    await expect(module.addBorderPreset(user)).resolves.toBe(true);
    await expect(module.updateBorderPreset({ ...user, name: 'Updated' })).resolves.toBe(true);

    const stored = storageState.value as HighlighterSettings;
    expect(stored.borderPresets.at(-1)).toMatchObject({
      id: 'user-1',
      name: 'Updated',
      origin: 'user',
    });
    expect(stored.catalogCustomized).toBe(true);
  });

  it('distinguishes applied, unchanged, and rejected command outcomes', async () => {
    const settings = createDefaultHighlighterSettings();
    settings.borderPresets[1] = { ...settings.borderPresets[1]!, enabled: false };
    seed(settings);
    const module = await loadHighlighterStorage();

    await expect(module.setDefaultBorderPresetWithOutcome('system-default')).resolves.toBe(
      'unchanged'
    );
    await expect(module.setDefaultBorderPresetWithOutcome('system-soft-highlight')).resolves.toBe(
      'rejected'
    );
    await expect(module.addBorderPresetWithOutcome(createUserPreset('user-1'))).resolves.toBe(
      'applied'
    );
    await expect(module.addBorderPresetWithOutcome(createUserPreset('user-1'))).resolves.toBe(
      'rejected'
    );
    await expect(module.updateBorderPresetWithOutcome(createUserPreset('missing'))).resolves.toBe(
      'rejected'
    );

    expect(syncSetMock).toHaveBeenCalledOnce();
  });

  it('edits a system preset and freezes its current localized name', async () => {
    const settings = createDefaultHighlighterSettings();
    seed(settings);
    const module = await loadHighlighterStorage();
    const accent = settings.borderPresets[0]!;

    await expect(
      module.updateBorderPreset({ ...accent, name: 'Accent', color: '#123456' })
    ).resolves.toBe(true);

    expect((storageState.value as HighlighterSettings).borderPresets[0]).toMatchObject({
      color: '#123456',
      customized: true,
      name: 'Accent',
      origin: 'system',
      systemPresetKey: 'system-default',
    });
  });

  it('allows disabling a system default and selects the next enabled preset deterministically', async () => {
    seed();
    const module = await loadHighlighterStorage();

    await expect(module.setBorderPresetEnabled('system-default', false)).resolves.toBe(true);

    const stored = storageState.value as HighlighterSettings;
    expect(stored.borderPresets[0]?.enabled).toBe(false);
    expect(stored.defaultBorderPresetId).toBe('system-soft-highlight');
    expect(stored.catalogCustomized).toBe(true);
    expect(stored.borderPresets[0]).toMatchObject({
      customized: false,
      systemPresetKey: 'system-default',
    });
    expect(stored.borderPresets[0]).not.toHaveProperty('name');
  });

  it('does not freeze localized names for reorder or default changes', async () => {
    seed();
    const module = await loadHighlighterStorage();

    await module.setDefaultBorderPreset('system-soft-highlight');
    await module.updateBorderPresetsOrder([
      'system-soft-highlight',
      'system-default',
      'system-marker',
      'system-success',
      'system-attention',
      'system-review',
      'system-light-ui',
      'system-dark-ui',
    ]);

    const stored = storageState.value as HighlighterSettings;
    expect(stored.borderPresets.find((preset) => preset.id === 'system-default')).toMatchObject({
      customized: false,
      systemPresetKey: 'system-default',
    });
    expect(
      stored.borderPresets.find((preset) => preset.id === 'system-default')
    ).not.toHaveProperty('name');
    expect(stored.catalogCustomized).toBe(true);
  });

  it('rejects an attempt to disable the last enabled preset', async () => {
    const settings = createDefaultHighlighterSettings();
    settings.borderPresets = settings.borderPresets.map((preset, index) => ({
      ...preset,
      enabled: index === 0,
    }));
    settings.catalogCustomized = true;
    seed(settings);
    const module = await loadHighlighterStorage();

    await expect(module.setBorderPresetEnabled('system-default', false)).resolves.toBe(false);
    expect(syncSetMock).not.toHaveBeenCalled();
  });

  it('resets a customized system preset without changing placement or default state', async () => {
    const settings = createDefaultHighlighterSettings();
    settings.borderPresets[0] = {
      ...settings.borderPresets[0]!,
      color: '#123456',
      customized: true,
      enabled: false,
      name: 'Custom accent',
      order: 7,
    };
    settings.defaultBorderPresetId = 'system-soft-highlight';
    settings.catalogCustomized = true;
    seed(settings);
    const module = await loadHighlighterStorage();

    await expect(module.resetSystemBorderPreset('system-default')).resolves.toBe(true);

    expect((storageState.value as HighlighterSettings).borderPresets[0]).toMatchObject({
      customized: false,
      enabled: false,
      order: 7,
      systemPresetKey: 'system-default',
    });
    expect((storageState.value as HighlighterSettings).borderPresets[0]).not.toHaveProperty(
      'color'
    );
    expect((await module.loadHighlighterSettings()).borderPresets[0]).toMatchObject({
      color: '#F97316',
      customized: false,
      name: 'system-default',
    });
    expect((storageState.value as HighlighterSettings).defaultBorderPresetId).toBe(
      'system-soft-highlight'
    );
  });

  it('never physically deletes a system preset but deletes a user preset', async () => {
    const settings = createDefaultHighlighterSettings();
    settings.borderPresets.push(createUserPreset('user-1', { order: 8 }));
    settings.catalogCustomized = true;
    seed(settings);
    const module = await loadHighlighterStorage();

    await expect(module.deleteBorderPreset('system-default')).resolves.toBe(false);
    await expect(module.deleteBorderPreset('user-1')).resolves.toBe(true);

    expect((storageState.value as HighlighterSettings).borderPresets).toHaveLength(15);
  });

  it('updates blur and focus fields without marking the preset catalog customized', async () => {
    seed();
    const module = await loadHighlighterStorage();

    await module.saveDefaultBlurSettings({ amount: 18, blurType: 'solid', showBorder: true });
    await module.saveDefaultFocusSettings({ opacity: 0.8, showBorder: true });

    expect(storageState.value).toMatchObject({
      catalogCustomized: false,
      defaultBlurSettings: { amount: 18, blurType: 'solid', showBorder: true },
      defaultFocusSettings: { opacity: 0.8, showBorder: true },
    });
  });
});
