// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppliedBorderSettings,
  BorderPreset,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { cloneBorderVisualStyle } from '@sniptale/runtime-contracts/highlighter/border-preset';

const persistenceMocks = vi.hoisted(() => ({
  addBorderPresetWithOutcome: vi.fn(),
  loadHighlighterSettings: vi.fn(),
  setBorderPresetEnabled: vi.fn(),
  updateBorderPresetWithOutcome: vi.fn(),
}));
const feedbackMocks = vi.hoisted(() => ({ error: vi.fn() }));
const loggerMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/highlighter')>()),
  ...persistenceMocks,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: feedbackMocks,
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => loggerMocks,
}));

import { useFrameStyleCatalog } from './catalog';

const PRESET: BorderPreset = {
  id: 'preset-1',
  name: 'Preset',
  order: 0,
  width: 2,
  color: '#ff6600',
  style: 'solid',
  radius: 4,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  shadow: 0,
  opacity: 100,
  customCss: '',
  fillColor: '#00000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  strokeOpacity: 100,
  enabled: true,
  origin: 'user',
};

const SECOND_PRESET: BorderPreset = {
  ...PRESET,
  id: 'preset-2',
  name: 'Second preset',
  order: 1,
};

const MANUAL_STYLE: AppliedBorderSettings = {
  width: 7,
  color: '#2563eb',
  style: 'dashed',
  radius: 9,
  padding: { top: 1, right: 2, bottom: 3, left: 4 },
  shadow: 20,
  opacity: 90,
  customCss: 'outline-offset: 2px;',
  fillColor: '#eff6ff',
  fillOpacity: 30,
  inheritCustomCss: true,
  strokeOpacity: 80,
  sourcePresetId: PRESET.id,
  sourcePresetName: PRESET.name,
};

const SETTINGS: HighlighterSettings = {
  borderPresets: [PRESET],
  defaultBlurSettings: { amount: 12, blurType: 'gaussian', showBorder: true },
  defaultBorderPresetId: PRESET.id,
  defaultEffectMode: 'border',
  defaultFocusSettings: { opacity: 0.6, showBorder: true },
  systemPresetCatalogRevision: 1,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof useFrameStyleCatalog> | null = null;
let reconcileCatalogSettings = vi.fn();
let onCanonicalPresetSaved = vi.fn();

function Harness(props: { isOpen: boolean }) {
  latest = useFrameStyleCatalog({
    isOpen: props.isOpen,
    onCanonicalPresetSaved,
    reconcileCatalogSettings,
  });
  return null;
}

function renderHarness(isOpen = true) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root?.render(<Harness isOpen={isOpen} />));
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error('Deferred promise is unavailable');
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      if (!rejectPromise) throw new Error('Deferred promise is unavailable');
      rejectPromise(reason);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.values(persistenceMocks).forEach((mock) => mock.mockReset());
  persistenceMocks.loadHighlighterSettings.mockResolvedValue(SETTINGS);
  feedbackMocks.error.mockReset();
  loggerMocks.error.mockReset();
  reconcileCatalogSettings = vi.fn();
  onCanonicalPresetSaved = vi.fn();
  latest = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('frame style catalog visibility', () => {
  it('refreshes templates from canonical settings without reopening the popover', async () => {
    const refreshedSettings = { ...SETTINGS, borderPresets: [PRESET, SECOND_PRESET] };
    persistenceMocks.loadHighlighterSettings.mockResolvedValue(refreshedSettings);
    renderHarness();

    await act(async () => latest?.refreshPresets());

    expect(persistenceMocks.loadHighlighterSettings).toHaveBeenCalledOnce();
    expect(reconcileCatalogSettings).toHaveBeenCalledWith(refreshedSettings);
  });

  it('persists a reversible visibility change and clears its pending state', async () => {
    const hiddenSettings = {
      ...SETTINGS,
      borderPresets: [{ ...PRESET, enabled: false }],
    };
    persistenceMocks.setBorderPresetEnabled.mockResolvedValue(true);
    persistenceMocks.loadHighlighterSettings.mockResolvedValue(hiddenSettings);
    renderHarness();

    await act(async () => latest?.handlers.handleTogglePresetEnabled(PRESET));

    expect(persistenceMocks.setBorderPresetEnabled).toHaveBeenCalledWith(PRESET.id, false);
    expect(reconcileCatalogSettings).toHaveBeenCalledWith(hiddenSettings);
    expect(latest?.pendingPresetIds.has(PRESET.id)).toBe(false);
  });

  it('keeps local state unchanged and reports a rejected visibility change', async () => {
    persistenceMocks.setBorderPresetEnabled.mockResolvedValue(false);
    renderHarness();

    await act(async () => latest?.handlers.handleTogglePresetEnabled(PRESET));

    expect(reconcileCatalogSettings).not.toHaveBeenCalled();
    expect(feedbackMocks.error).toHaveBeenCalledOnce();
  });

  it('retries canonical reconciliation without replaying a committed visibility change', async () => {
    const hiddenSettings = {
      ...SETTINGS,
      borderPresets: [{ ...PRESET, enabled: false }],
    };
    persistenceMocks.setBorderPresetEnabled.mockResolvedValue(true);
    persistenceMocks.loadHighlighterSettings
      .mockRejectedValueOnce(new Error('canonical read failed'))
      .mockResolvedValueOnce(hiddenSettings);
    renderHarness();

    await act(async () => latest?.handlers.handleTogglePresetEnabled(PRESET));
    expect(persistenceMocks.setBorderPresetEnabled).toHaveBeenCalledOnce();
    expect(reconcileCatalogSettings).not.toHaveBeenCalled();

    await act(async () => latest?.handlers.handleTogglePresetEnabled(PRESET));

    expect(persistenceMocks.setBorderPresetEnabled).toHaveBeenCalledOnce();
    expect(persistenceMocks.loadHighlighterSettings).toHaveBeenCalledTimes(2);
    expect(reconcileCatalogSettings).toHaveBeenCalledWith(hiddenSettings);
  });

  it('serializes visibility mutation and reload workflows before publishing canonical state', async () => {
    const firstLoad = createDeferred<HighlighterSettings>();
    const secondLoad = createDeferred<HighlighterSettings>();
    const firstSettings = {
      ...SETTINGS,
      borderPresets: [{ ...PRESET, enabled: false }, SECOND_PRESET],
    };
    const secondSettings = {
      ...SETTINGS,
      borderPresets: [
        { ...PRESET, enabled: false },
        { ...SECOND_PRESET, enabled: false },
      ],
    };
    persistenceMocks.setBorderPresetEnabled.mockResolvedValue(true);
    persistenceMocks.loadHighlighterSettings
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);
    renderHarness();

    let firstOperation: Promise<void> | undefined;
    let secondOperation: Promise<void> | undefined;
    act(() => {
      firstOperation = latest?.handlers.handleTogglePresetEnabled(PRESET);
      secondOperation = latest?.handlers.handleTogglePresetEnabled(SECOND_PRESET);
    });
    await act(async () => Promise.resolve());

    expect(persistenceMocks.setBorderPresetEnabled).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.loadHighlighterSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstLoad.resolve(firstSettings);
      await firstOperation;
    });

    expect(persistenceMocks.setBorderPresetEnabled).toHaveBeenCalledTimes(2);
    expect(persistenceMocks.loadHighlighterSettings).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondLoad.resolve(secondSettings);
      await secondOperation;
    });

    expect(reconcileCatalogSettings.mock.calls).toEqual([[firstSettings], [secondSettings]]);
  });
});

describe('frame style catalog manual saves', () => {
  it('creates a user preset from visual fields and returns its canonical persisted form', async () => {
    let submitted: BorderPreset | undefined;
    persistenceMocks.addBorderPresetWithOutcome.mockImplementation(async (preset) => {
      submitted = preset;
      return 'applied';
    });
    persistenceMocks.loadHighlighterSettings.mockImplementation(async () => ({
      ...SETTINGS,
      borderPresets: [PRESET, submitted as BorderPreset],
    }));
    renderHarness();

    let result: BorderPreset | null | undefined;
    await act(async () => {
      result = await latest?.manual.save({ name: '  Manual blue  ', style: MANUAL_STYLE });
    });

    expect(submitted).toMatchObject({
      id: expect.any(String),
      name: 'Manual blue',
      origin: 'user',
      enabled: true,
      order: 0,
      width: MANUAL_STYLE.width,
      padding: MANUAL_STYLE.padding,
    });
    expect(submitted).not.toHaveProperty('sourcePresetId');
    expect(submitted).not.toHaveProperty('sourcePresetName');
    expect(result).toEqual(submitted);
    expect(reconcileCatalogSettings).toHaveBeenCalledWith(
      expect.objectContaining({ borderPresets: [PRESET, submitted] }),
      submitted?.id
    );
    expect(latest?.manual.isSaving).toBe(false);
  });

  it('updates only visual fields while preserving system preset identity', async () => {
    const systemPreset: BorderPreset = {
      ...PRESET,
      customized: false,
      id: 'system-preset',
      name: 'System preset',
      origin: 'system',
      systemPresetKey: 'system-default',
    };
    const canonical = {
      ...systemPreset,
      ...cloneBorderVisualStyle(MANUAL_STYLE),
      customized: true,
    };
    const canonicalSettings = {
      ...SETTINGS,
      borderPresets: [canonical],
      defaultBorderPresetId: canonical.id,
    };
    persistenceMocks.updateBorderPresetWithOutcome.mockResolvedValue('applied');
    persistenceMocks.loadHighlighterSettings.mockResolvedValue(canonicalSettings);
    renderHarness();

    let result: BorderPreset | null | undefined;
    await act(async () => {
      result = await latest?.manual.save({ overwrite: systemPreset, style: MANUAL_STYLE });
    });

    const persisted = persistenceMocks.updateBorderPresetWithOutcome.mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      id: systemPreset.id,
      name: systemPreset.name,
      origin: 'system',
      systemPresetKey: systemPreset.systemPresetKey,
      width: MANUAL_STYLE.width,
    });
    expect(persisted).not.toHaveProperty('sourcePresetId');
    expect(persisted).not.toHaveProperty('sourcePresetName');
    expect(result).toEqual(canonical);
    expect(reconcileCatalogSettings).toHaveBeenCalledWith(canonicalSettings, canonical.id);
  });

  it('ignores duplicate manual submissions while the first mutation is pending', async () => {
    const deferred = createDeferred<'applied'>();
    const canonical = { ...PRESET, width: MANUAL_STYLE.width };
    persistenceMocks.updateBorderPresetWithOutcome.mockReturnValue(deferred.promise);
    persistenceMocks.loadHighlighterSettings.mockResolvedValue({
      ...SETTINGS,
      borderPresets: [canonical],
    });
    renderHarness();

    let firstSave: Promise<BorderPreset | null> | undefined;
    let duplicateResult: BorderPreset | null | undefined;
    act(() => {
      firstSave = latest?.manual.save({ overwrite: PRESET, style: MANUAL_STYLE });
    });
    await act(async () => {
      duplicateResult = await latest?.manual.save({ overwrite: PRESET, style: MANUAL_STYLE });
    });
    expect(duplicateResult).toBeNull();
    expect(persistenceMocks.updateBorderPresetWithOutcome).toHaveBeenCalledOnce();
    expect(latest?.manual.isSaving).toBe(true);

    await act(async () => {
      deferred.resolve('applied');
      await firstSave;
    });
    expect(latest?.manual.isSaving).toBe(false);
  });

  it('keeps stale manual completion silent after the popover session closes', async () => {
    const deferred = createDeferred<'applied'>();
    persistenceMocks.updateBorderPresetWithOutcome.mockReturnValue(deferred.promise);
    renderHarness();

    let staleSave: Promise<BorderPreset | null> | undefined;
    act(() => {
      staleSave = latest?.manual.save({ overwrite: PRESET, style: MANUAL_STYLE });
    });
    renderHarness(false);

    await act(async () => {
      deferred.resolve('applied');
      await staleSave;
    });

    expect(persistenceMocks.loadHighlighterSettings).not.toHaveBeenCalled();
    expect(reconcileCatalogSettings).not.toHaveBeenCalled();
    expect(feedbackMocks.error).not.toHaveBeenCalled();
    expect(latest?.manual.isSaving).toBe(false);
  });

  it('reports a rejected manual save without publishing catalog state', async () => {
    persistenceMocks.updateBorderPresetWithOutcome.mockResolvedValue('rejected');
    renderHarness();

    let result: BorderPreset | null | undefined;
    await act(async () => {
      result = await latest?.manual.save({ overwrite: PRESET, style: MANUAL_STYLE });
    });

    expect(result).toBeNull();
    expect(reconcileCatalogSettings).not.toHaveBeenCalled();
    expect(feedbackMocks.error).toHaveBeenCalledOnce();
  });
});

describe('frame style catalog editor', () => {
  it('opens create and edit drafts and closes them with the popover lifecycle', () => {
    renderHarness();

    act(() => latest?.handlers.handleAddPreset());
    expect(latest?.editor).toMatchObject({ isOpen: true, preset: undefined });

    act(() => latest?.handlers.handleEditPreset(PRESET));
    expect(latest?.editor).toMatchObject({ isOpen: true, preset: PRESET });

    renderHarness(false);
    expect(latest?.editor.isOpen).toBe(false);
  });

  it('adds a new style through the persistence owner and reveals it in the current session', async () => {
    const created = { ...PRESET, id: 'created-preset', name: 'Created' };
    const canonicalSettings = { ...SETTINGS, borderPresets: [PRESET, created] };
    persistenceMocks.addBorderPresetWithOutcome.mockResolvedValue('applied');
    persistenceMocks.loadHighlighterSettings.mockResolvedValue(canonicalSettings);
    renderHarness();
    act(() => latest?.handlers.handleAddPreset());

    await act(async () => latest?.editor.onSave(created));

    expect(persistenceMocks.addBorderPresetWithOutcome).toHaveBeenCalledWith(created);
    expect(reconcileCatalogSettings).toHaveBeenCalledWith(canonicalSettings, created.id);
    expect(onCanonicalPresetSaved).toHaveBeenCalledWith(canonicalSettings, created.id);
    expect(latest?.editor.isOpen).toBe(false);
  });

  it('retries canonical reconciliation without creating a second preset after a committed add', async () => {
    const created = { ...PRESET, id: 'created-preset', name: 'Created' };
    const retryDraft = { ...created, id: 'different-retry-id' };
    const canonicalSettings = { ...SETTINGS, borderPresets: [PRESET, created] };
    persistenceMocks.addBorderPresetWithOutcome.mockResolvedValue('applied');
    persistenceMocks.loadHighlighterSettings
      .mockRejectedValueOnce(new Error('canonical read failed'))
      .mockResolvedValueOnce(canonicalSettings);
    renderHarness();
    act(() => latest?.handlers.handleAddPreset());

    await act(async () => latest?.editor.onSave(created));

    expect(persistenceMocks.addBorderPresetWithOutcome).toHaveBeenCalledOnce();
    expect(latest?.editor.isOpen).toBe(true);

    await act(async () => latest?.editor.onSave(retryDraft));

    expect(persistenceMocks.addBorderPresetWithOutcome).toHaveBeenCalledOnce();
    expect(reconcileCatalogSettings).toHaveBeenCalledWith(canonicalSettings, created.id);
    expect(onCanonicalPresetSaved).toHaveBeenCalledWith(canonicalSettings, created.id);
    expect(latest?.editor.isOpen).toBe(false);
  });

  it('keeps a rejected edit open and reports the failure', async () => {
    persistenceMocks.updateBorderPresetWithOutcome.mockResolvedValue('rejected');
    renderHarness();
    act(() => latest?.handlers.handleEditPreset(PRESET));

    await act(async () => latest?.editor.onSave(PRESET));

    expect(reconcileCatalogSettings).not.toHaveBeenCalled();
    expect(onCanonicalPresetSaved).not.toHaveBeenCalled();
    expect(feedbackMocks.error).toHaveBeenCalledOnce();
    expect(latest?.editor.isOpen).toBe(true);
  });

  it('ignores duplicate save submissions while the current request is pending', async () => {
    const deferred = createDeferred<'applied'>();
    persistenceMocks.updateBorderPresetWithOutcome.mockReturnValue(deferred.promise);
    renderHarness();
    act(() => latest?.handlers.handleEditPreset(PRESET));

    let firstSave: Promise<void> | undefined;
    act(() => {
      firstSave = latest?.editor.onSave(PRESET);
      void latest?.editor.onSave(PRESET);
    });
    await act(async () => Promise.resolve());

    expect(persistenceMocks.updateBorderPresetWithOutcome).toHaveBeenCalledOnce();
    expect(latest?.editor.isSaving).toBe(true);

    await act(async () => {
      deferred.resolve('applied');
      await firstSave;
    });
    expect(latest?.editor.isOpen).toBe(false);
  });

  it('does not let an older save completion close a newly opened editor session', async () => {
    const deferred = createDeferred<'applied'>();
    persistenceMocks.updateBorderPresetWithOutcome.mockReturnValue(deferred.promise);
    renderHarness();
    act(() => latest?.handlers.handleEditPreset(PRESET));

    let staleSave: Promise<void> | undefined;
    act(() => {
      staleSave = latest?.editor.onSave(PRESET);
    });
    expect(latest?.editor.isSaving).toBe(true);

    act(() => latest?.editor.onClose());
    act(() => latest?.handlers.handleAddPreset());
    expect(latest?.editor).toMatchObject({ isOpen: true, isSaving: false, preset: undefined });

    await act(async () => {
      deferred.resolve('applied');
      await staleSave;
    });

    expect(reconcileCatalogSettings).not.toHaveBeenCalled();
    expect(onCanonicalPresetSaved).not.toHaveBeenCalled();
    expect(latest?.editor).toMatchObject({ isOpen: true, preset: undefined });
  });

  it('reconciles a system style edit from canonical persistence normalization', async () => {
    const systemPreset = {
      ...PRESET,
      customized: false,
      id: 'system-preset',
      origin: 'system' as const,
      systemPresetKey: 'system-default' as const,
    };
    const submitted = { ...systemPreset, name: 'Custom system style' };
    const canonical = { ...submitted, customized: true };
    const canonicalSettings = {
      ...SETTINGS,
      borderPresets: [canonical],
      defaultBorderPresetId: canonical.id,
    };
    persistenceMocks.updateBorderPresetWithOutcome.mockResolvedValue('applied');
    persistenceMocks.loadHighlighterSettings.mockResolvedValue(canonicalSettings);
    renderHarness();
    act(() => latest?.handlers.handleEditPreset(systemPreset));

    await act(async () => latest?.editor.onSave(submitted));

    expect(reconcileCatalogSettings).toHaveBeenCalledWith(canonicalSettings, canonical.id);
    expect(reconcileCatalogSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ borderPresets: [submitted] }),
      canonical.id
    );
  });
});
