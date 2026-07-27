// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  loadHighlighterSettings: vi.fn(),
  updateBorderPresetWithOutcome: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('../../../../composition/persistence/highlighter', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../composition/persistence/highlighter')
  >('../../../../composition/persistence/highlighter');

  return {
    ...actual,
    loadHighlighterSettings: storageMocks.loadHighlighterSettings,
    updateBorderPresetWithOutcome: storageMocks.updateBorderPresetWithOutcome,
  };
});

import { useFrameSettingsPopoverState } from '.';
import { useFrameSettingsPopoverLifecycle } from './lifecycle';

const DEFAULT_SETTINGS: HighlighterSettings = {
  borderPresets: [],
  defaultBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
  defaultBorderPresetId: 'preset-1',
  defaultEffectMode: 'border',
  systemPresetCatalogRevision: 1,
  defaultFocusSettings: { opacity: 0.5, showBorder: false },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useFrameSettingsPopoverState> | null = null;
let latestLifecycle: ReturnType<typeof useFrameSettingsPopoverLifecycle> | null = null;
let onApplyToFrame = vi.fn();

function Harness(props: {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
  isOpen: boolean;
  tick: number;
}) {
  latestState = useFrameSettingsPopoverState({
    frameId: 'frame-1',
    isOpen: props.isOpen,
    onApplyToFrame,
    ...(props.blurSettings === undefined ? {} : { blurSettings: props.blurSettings }),
    ...(props.borderSettings === undefined ? {} : { borderSettings: props.borderSettings }),
    ...(props.focusSettings === undefined ? {} : { focusSettings: props.focusSettings }),
  });

  return <div data-tick={String(props.tick)} />;
}

function LifecycleHarness(props: { isOpen: boolean }) {
  latestLifecycle = useFrameSettingsPopoverLifecycle({
    frameId: 'frame-1',
    isOpen: props.isOpen,
  });
  return null;
}

function renderHarness(
  isOpen: boolean,
  tick: number,
  source: {
    blurSettings?: BlurSettings;
    borderSettings?: BorderPreset;
    focusSettings?: FocusSettings;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness isOpen={isOpen} tick={tick} {...source} />);
  });
}

function renderLifecycleHarness(isOpen: boolean) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(<LifecycleHarness isOpen={isOpen} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storageMocks.loadHighlighterSettings.mockReset();
  storageMocks.updateBorderPresetWithOutcome.mockReset();
  storageMocks.updateBorderPresetWithOutcome.mockResolvedValue('applied');
  loggerMocks.error.mockReset();
  onApplyToFrame = vi.fn();
  latestState = null;
  latestLifecycle = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  latestLifecycle = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('frame settings popover state lifecycle', () => {
  it('loads persisted defaults once while the popover stays open across rerenders', async () => {
    storageMocks.loadHighlighterSettings.mockResolvedValue(DEFAULT_SETTINGS);

    renderHarness(true, 0);
    renderHarness(true, 1);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storageMocks.loadHighlighterSettings).toHaveBeenCalledTimes(1);
  });

  it('logs loader failures without throwing through the popover lifecycle', async () => {
    const error = new Error('storage offline');
    storageMocks.loadHighlighterSettings.mockRejectedValue(error);

    renderHarness(true, 0);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Failed to load frame-settings popover defaults',
      error
    );
  });

  it('hydrates one draft from frame settings and preserves transaction ordering', () => {
    storageMocks.loadHighlighterSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const beginTransaction = vi.spyOn(pagePreparationHistory, 'beginTransaction');
    const commitTransaction = vi.spyOn(pagePreparationHistory, 'commitTransaction');
    const cancelTransaction = vi.spyOn(pagePreparationHistory, 'cancelTransaction');
    const blurSettings: BlurSettings = {
      amount: 24,
      blurType: 'pixelate',
      showBorder: false,
    };
    const borderSettings = { id: 'frame-border' } as BorderPreset;
    const focusSettings: FocusSettings = { opacity: 0.7, showBorder: true };

    renderHarness(false, 0, { blurSettings, borderSettings, focusSettings });
    renderHarness(true, 1, { blurSettings, borderSettings, focusSettings });

    expect(beginTransaction).toHaveBeenCalledOnce();
    expect(beginTransaction).toHaveBeenCalledWith('frame-settings:frame-1');
    expect(latestState?.settings).toMatchObject({
      localBlur: blurSettings,
      localFocus: focusSettings,
      selectedPresetId: 'frame-border',
    });

    renderHarness(false, 2, { blurSettings, borderSettings, focusSettings });
    expect(commitTransaction).toHaveBeenCalledOnce();
    expect(commitTransaction).toHaveBeenCalledWith('frame-settings:frame-1');

    act(() => root?.unmount());
    root = null;
    expect(cancelTransaction).toHaveBeenCalledWith('frame-settings:frame-1');
  });

  it('updates global defaults without overwriting a dirty local draft', async () => {
    let resolveSettings: ((settings: HighlighterSettings) => void) | undefined;
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>((resolve) => {
        resolveSettings = resolve;
      })
    );
    renderHarness(true, 0);

    act(() => {
      latestState?.handlers.handleBlurChange(37);
    });
    await act(async () => {
      resolveSettings?.(DEFAULT_SETTINGS);
      await Promise.resolve();
    });

    expect(latestState?.settings.global).toEqual(DEFAULT_SETTINGS);
    expect(latestState?.settings.localBlur.amount).toBe(37);
    expect(latestState?.settings.localBlur).not.toEqual(DEFAULT_SETTINGS.defaultBlurSettings);
  });

  it('does not publish an older open-time load after a catalog mutation revision', async () => {
    let resolveSettings: ((settings: HighlighterSettings) => void) | undefined;
    const oldSettings = {
      ...DEFAULT_SETTINGS,
      borderPresets: [DEFAULT_BORDER_PRESET],
      defaultBorderPresetId: DEFAULT_BORDER_PRESET.id,
    };
    const canonicalPreset = {
      ...DEFAULT_BORDER_PRESET,
      enabled: false,
      name: 'Canonical mutation',
    };
    const canonicalSettings = {
      ...oldSettings,
      borderPresets: [canonicalPreset],
    };
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>((resolve) => {
        resolveSettings = resolve;
      })
    );
    renderLifecycleHarness(true);

    act(() => {
      latestLifecycle?.catalog.reconcileCatalogSettings(canonicalSettings, canonicalPreset.id);
    });
    await act(async () => {
      resolveSettings?.(oldSettings);
      await Promise.resolve();
    });

    expect(latestLifecycle?.catalog.globalSettings).toEqual(canonicalSettings);
    expect(latestLifecycle?.catalog.visibleBorderPresets).toEqual([canonicalPreset]);
  });

  it('applies a canonical edit immediately when it updates the frame selected preset', async () => {
    const activePreset = {
      ...DEFAULT_BORDER_PRESET,
      id: 'active-preset',
      name: 'Active preset',
    };
    const submittedPreset = { ...activePreset, width: 7 };
    const canonicalPreset = { ...submittedPreset, customized: true };
    const canonicalSettings = {
      ...DEFAULT_SETTINGS,
      borderPresets: [canonicalPreset],
      defaultBorderPresetId: canonicalPreset.id,
    };
    storageMocks.loadHighlighterSettings.mockResolvedValue(canonicalSettings);
    renderHarness(true, 0, { borderSettings: activePreset });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latestState?.settings.selectedPresetId).toBe(activePreset.id);
    act(() => latestState?.handlers.handleEditPreset(activePreset));

    await act(async () => latestState?.catalog.editor.onSave(submittedPreset));

    expect(onApplyToFrame).toHaveBeenCalledWith({
      borderSettings: { ...canonicalPreset, padding: { ...canonicalPreset.padding } },
    });
  });

  it('does not restyle the frame when a different catalog preset is edited', async () => {
    const activePreset = {
      ...DEFAULT_BORDER_PRESET,
      id: 'active-preset',
      name: 'Active preset',
    };
    const otherPreset = {
      ...DEFAULT_BORDER_PRESET,
      id: 'other-preset',
      name: 'Other preset',
    };
    const canonicalOtherPreset = { ...otherPreset, width: 7 };
    storageMocks.loadHighlighterSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      borderPresets: [activePreset, canonicalOtherPreset],
      defaultBorderPresetId: activePreset.id,
    });
    renderHarness(true, 0, { borderSettings: activePreset });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => latestState?.handlers.handleEditPreset(otherPreset));

    await act(async () => latestState?.catalog.editor.onSave(canonicalOtherPreset));

    expect(onApplyToFrame).not.toHaveBeenCalled();
  });
});
