// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type {
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { CalloutSettings } from '../../../../features/highlighter/contracts';
import type { GlobalStepBadgeSettings } from '../../../../features/highlighter/contracts';
import type { FrameSessionSyncArgs } from '../session/core';
import { useFrameSessionSync } from './useFrameSessionSync';

const coreMocks = vi.hoisted(() => {
  const cleanup = vi.fn();

  return {
    cleanup,
    setupFrameSessionSyncListeners: vi.fn<(args: FrameSessionSyncArgs) => () => void>(
      () => cleanup
    ),
  };
});

vi.mock('../session/core', async () => {
  const actual = await vi.importActual<typeof import('../session/core')>('../session/core');

  return {
    ...actual,
    setupFrameSessionSyncListeners: coreMocks.setupFrameSessionSyncListeners,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const DEFAULT_SETTINGS: HighlighterSettings = {
  borderPresets: [],
  defaultBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
  defaultBorderPresetId: 'preset-1',
  defaultEffectMode: 'border',
  defaultFocusSettings: { opacity: 0.5, showBorder: false },
};

function Harness(props: {
  reorderStepBadge?: (frameId: string, direction: 'up' | 'down') => void;
  syncFocusOpacity?: (sourceFrameId: string, newOpacity: number) => void;
  updateFrameStepBadge?: (frameId: string, settings: { value?: string }) => void;
  updateGlobalStepBadgeSettings?: (settings: Partial<GlobalStepBadgeSettings>) => void;
  withHistoryCommit?: <T extends (...args: never[]) => unknown>(action: T) => T;
}) {
  const globalEffectModeRef = useRef<'border'>('border');
  const highlighterSettingsCacheRef = useRef<HighlighterSettings | null>(DEFAULT_SETTINGS);
  const sessionBlurSettingsRef = useRef<BlurSettings>(DEFAULT_SETTINGS.defaultBlurSettings);
  const sessionCalloutStyleRef = useRef<Partial<CalloutSettings> | null>(null);
  const sessionFocusSettingsRef = useRef<FocusSettings>(DEFAULT_SETTINGS.defaultFocusSettings);

  useFrameSessionSync({
    globalEffectModeRef,
    highlighterSettingsCacheRef,
    reorderStepBadge: props.reorderStepBadge ?? vi.fn(),
    sessionBlurSettingsRef,
    sessionCalloutStyleRef,
    sessionFocusSettingsRef,
    setFrames: vi.fn(),
    syncFocusOpacity: props.syncFocusOpacity ?? vi.fn(),
    updateFrameStepBadge:
      props.updateFrameStepBadge ??
      ((() => undefined) as (frameId: string, settings: { value?: string }) => void),
    updateGlobalStepBadgeSettings:
      props.updateGlobalStepBadgeSettings ??
      ((() => undefined) as (settings: Partial<GlobalStepBadgeSettings>) => void),
    withHistoryCommit:
      props.withHistoryCommit ??
      ((<T extends (...args: never[]) => unknown>(action: T) => action) as <
        T extends (...args: never[]) => unknown,
      >(
        action: T
      ) => T),
  });

  return null;
}

async function renderHarness(props: React.ComponentProps<typeof Harness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  coreMocks.cleanup.mockReset();
  coreMocks.setupFrameSessionSyncListeners.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useFrameSessionSync', () => {
  it('subscribes once and forwards events through the latest callbacks after rerender', async () => {
    const initialSyncFocusOpacity = vi.fn();
    const nextSyncFocusOpacity = vi.fn();

    await renderHarness({ syncFocusOpacity: initialSyncFocusOpacity });

    expect(coreMocks.setupFrameSessionSyncListeners).toHaveBeenCalledTimes(1);

    await renderHarness({ syncFocusOpacity: nextSyncFocusOpacity });

    expect(coreMocks.setupFrameSessionSyncListeners).toHaveBeenCalledTimes(1);

    const listenerArgs = coreMocks.setupFrameSessionSyncListeners.mock.calls[0]?.[0] as
      | FrameSessionSyncArgs
      | undefined;
    listenerArgs?.syncFocusOpacity('frame-1', 0.75);

    expect(initialSyncFocusOpacity).not.toHaveBeenCalled();
    expect(nextSyncFocusOpacity).toHaveBeenCalledWith('frame-1', 0.75);
  });
});
