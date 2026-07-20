// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useFrameSessionSync: vi.fn(),
}));

vi.mock('./useFrameSessionSync', () => ({
  useFrameSessionSync: mocks.useFrameSessionSync,
}));

import { useFrameManagerSessionEffects } from './useFrameManagerSessionEffects';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentArgs: Parameters<typeof useFrameManagerSessionEffects>[0] | null = null;

function createArgs(): Parameters<typeof useFrameManagerSessionEffects>[0] {
  return {
    refs: {
      globalEffectModeRef: { current: 'border' },
      highlighterSettingsCacheRef: { current: null },
      sessionBlurSettingsRef: { current: { amount: 8, blurType: 'gaussian', showBorder: true } },
      sessionCalloutStyleRef: { current: null },
      sessionFocusSettingsRef: { current: { opacity: 0.5, showBorder: false } },
    } as Parameters<typeof useFrameManagerSessionEffects>[0]['refs'],
    reorderStepBadge: vi.fn(),
    setFrames: vi.fn(),
    syncFocusOpacity: vi.fn(),
    updateFrameStepBadge: vi.fn(),
    updateGlobalStepBadgeSettings: vi.fn(),
    withHistoryCommit: (<T extends (...args: never[]) => unknown>(action: T) =>
      action) as Parameters<typeof useFrameManagerSessionEffects>[0]['withHistoryCommit'],
  };
}

function Harness() {
  useFrameManagerSessionEffects(currentArgs ?? createArgs());
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.useFrameSessionSync.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentArgs = null;
  vi.unstubAllGlobals();
});

describe('frame-manager-session-effects', () => {
  it('routes session effects through the explicit syncFocusOpacity seam', async () => {
    currentArgs = createArgs();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness />);
    });

    expect(mocks.useFrameSessionSync).toHaveBeenCalledWith({
      globalEffectModeRef: currentArgs.refs.globalEffectModeRef,
      highlighterSettingsCacheRef: currentArgs.refs.highlighterSettingsCacheRef,
      reorderStepBadge: currentArgs.reorderStepBadge,
      sessionBlurSettingsRef: currentArgs.refs.sessionBlurSettingsRef,
      sessionCalloutStyleRef: currentArgs.refs.sessionCalloutStyleRef,
      sessionFocusSettingsRef: currentArgs.refs.sessionFocusSettingsRef,
      setFrames: currentArgs.setFrames,
      syncFocusOpacity: currentArgs.syncFocusOpacity,
      updateFrameStepBadge: currentArgs.updateFrameStepBadge,
      updateGlobalStepBadgeSettings: currentArgs.updateGlobalStepBadgeSettings,
      withHistoryCommit: currentArgs.withHistoryCommit,
    });
  });
});
