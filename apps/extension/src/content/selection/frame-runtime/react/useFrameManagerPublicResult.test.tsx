// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlobalStepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

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
    addFreeFrame: vi.fn(),
    clearAutoBlurFrames: vi.fn(),
    clearFrames: vi.fn(),
    frames: [],
    getFutureFrameStyle: vi.fn(() => ({
      blurSettings: { amount: 8, blurType: 'gaussian' as const },
      borderSettings: DEFAULT_BORDER_PRESET,
      effectMode: 'border' as const,
      focusSettings: { opacity: 0.5 },
    })),
    getGlobalStepBadgeSettings,
    hasFrameForElement: vi.fn(() => false),
    recalculateStepBadges: vi.fn(),
    removeFrame: vi.fn(),
    setFutureFrameEffectMode: vi.fn(),
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

    expect(latestPublicResult).toEqual({
      addAutoBlurFrames: currentArgs.addAutoBlurFrames,
      addFrame: currentArgs.addFrame,
      addFreeFrame: currentArgs.addFreeFrame,
      clearAutoBlurFrames: currentArgs.clearAutoBlurFrames,
      clearFrames: currentArgs.clearFrames,
      frames: currentArgs.frames,
      getFutureFrameStyle: currentArgs.getFutureFrameStyle,
      getGlobalStepBadgeSettings: currentArgs.getGlobalStepBadgeSettings,
      hasFrameForElement: currentArgs.hasFrameForElement,
      recalculateStepBadges: currentArgs.recalculateStepBadges,
      removeFrame: currentArgs.removeFrame,
      setFutureFrameEffectMode: currentArgs.setFutureFrameEffectMode,
      syncAutoBlurFrames: currentArgs.syncAutoBlurFrames,
      syncFocusOpacity: currentArgs.syncFocusOpacity,
      updateFrame: currentArgs.updateFrame,
      updateFrameEffect: currentArgs.updateFrameEffect,
      updateFrameStepBadge: currentArgs.updateFrameStepBadge,
      updateGlobalStepBadgeSettings: currentArgs.updateGlobalStepBadgeSettings,
    });
    latestPublicResult?.addAutoBlurFrames({
      borderSettings: DEFAULT_BORDER_PRESET,
      blurSettings: { amount: 8, blurType: 'solid' },
      targets: [],
    });
    latestPublicResult?.addFrame(document.createElement('div'));
    latestPublicResult?.clearAutoBlurFrames({ targets: [] });
    latestPublicResult?.syncAutoBlurFrames({
      borderSettings: DEFAULT_BORDER_PRESET,
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

  it('preserves result identity until a public member changes', async () => {
    currentArgs = createArgs();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness />);
    });
    const initialResult = latestPublicResult;

    currentArgs = { ...currentArgs };
    await act(async () => {
      root?.render(<Harness />);
    });
    expect(latestPublicResult).toBe(initialResult);

    currentArgs = { ...currentArgs, removeFrame: vi.fn() };
    await act(async () => {
      root?.render(<Harness />);
    });
    expect(latestPublicResult).not.toBe(initialResult);
    expect(latestPublicResult?.removeFrame).toBe(currentArgs.removeFrame);
  });
});
