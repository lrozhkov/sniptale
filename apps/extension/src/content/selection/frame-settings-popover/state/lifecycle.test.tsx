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

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  loadHighlighterSettings: vi.fn(),
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
  };
});

import { useFrameSettingsPopoverState } from '.';

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
    onApplyToFrame: () => undefined,
    ...(props.blurSettings === undefined ? {} : { blurSettings: props.blurSettings }),
    ...(props.borderSettings === undefined ? {} : { borderSettings: props.borderSettings }),
    ...(props.focusSettings === undefined ? {} : { focusSettings: props.focusSettings }),
  });

  return <div data-tick={String(props.tick)} />;
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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storageMocks.loadHighlighterSettings.mockReset();
  loggerMocks.error.mockReset();
  latestState = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
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
});
