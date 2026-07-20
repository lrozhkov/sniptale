// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlobalStepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';

import { useFrameManagerPublicResult } from './useFrameManagerPublicResult';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestPublicResult: ReturnType<typeof useFrameManagerPublicResult> | null = null;
let currentArgs: Parameters<typeof useFrameManagerPublicResult>[0] | null = null;

function createArgs(): Parameters<typeof useFrameManagerPublicResult>[0] {
  const getGlobalStepBadgeSettings = vi.fn(
    (): GlobalStepBadgeSettings => ({
      autoMode: false,
    })
  );

  return {
    addAutoBlurFrames: vi.fn(),
    addFrame: vi.fn(),
    clearAutoBlurFrames: vi.fn(),
    clearFrames: vi.fn(),
    frames: [],
    getGlobalStepBadgeSettings,
    hasFrameForElement: vi.fn(() => false),
    recalculateStepBadges: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
    updateFrameStepBadge: vi.fn(),
    updateGlobalStepBadgeSettings: vi.fn(),
  };
}

function Harness() {
  latestPublicResult = useFrameManagerPublicResult(currentArgs ?? createArgs());
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestPublicResult = null;
  currentArgs = null;
  vi.unstubAllGlobals();
});

describe('frame-manager-public-result-hook', () => {
  it('builds the public frame-manager surface from explicit callbacks and latest getters', async () => {
    currentArgs = createArgs();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness />);
    });

    expect(latestPublicResult).not.toBeNull();
    latestPublicResult?.addAutoBlurFrames({
      blurSettings: { amount: 8, blurType: 'solid' },
      targets: [],
    });
    latestPublicResult?.addFrame(document.createElement('div'));
    latestPublicResult?.clearAutoBlurFrames({ targets: [] });
    latestPublicResult?.syncAutoBlurFrames({
      blurSettings: { amount: 8, blurType: 'solid' },
      targets: [],
    });
    latestPublicResult?.removeFrame('frame-1');
    latestPublicResult?.clearFrames();

    expect(currentArgs.addAutoBlurFrames).toHaveBeenCalledTimes(1);
    expect(currentArgs.clearAutoBlurFrames).toHaveBeenCalledTimes(1);
    expect(currentArgs.syncAutoBlurFrames).toHaveBeenCalledTimes(1);
    expect(currentArgs.addFrame).toHaveBeenCalledTimes(1);
    expect(currentArgs.removeFrame).toHaveBeenCalledWith('frame-1');
    expect(currentArgs.clearFrames).toHaveBeenCalledTimes(1);
    expect(latestPublicResult?.getGlobalStepBadgeSettings()).toEqual({
      autoMode: false,
    });
    expect(currentArgs.getGlobalStepBadgeSettings).toHaveBeenCalledTimes(1);
  });
});
