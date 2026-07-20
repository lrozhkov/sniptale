// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { log: vi.fn() },
  mutations: {
    addFrame: vi.fn(),
    clearFrames: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
  },
  useFrameMutationActions: vi.fn(() => mocks.mutations),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => mocks.logger,
}));

vi.mock('../mutation-actions', () => ({
  useFrameMutationActions: mocks.useFrameMutationActions,
}));

import { useFrameManagerMutations } from './useFrameManagerMutations';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestResult: ReturnType<typeof useFrameManagerMutations> | null = null;
let currentArgs: {
  recalculateStepBadgesRef: Parameters<typeof useFrameManagerMutations>[2];
  refs: Parameters<typeof useFrameManagerMutations>[1];
  setFrames: Parameters<typeof useFrameManagerMutations>[0];
} | null = null;

function createArgs() {
  return {
    recalculateStepBadgesRef: { current: vi.fn() },
    refs: {
      containerRef: { current: null },
      frameStatesRef: { current: new Map() },
      framesRef: { current: [] },
      globalEffectModeRef: { current: 'border' },
      globalStepBadgeAutoModeRef: { current: false },
      globalStepBadgeSettingsRef: { current: { autoMode: false } },
      highlighterSettingsCacheRef: { current: null },
      isClearingRef: { current: false },
      linkedElementsRef: { current: new Map() },
      prevFrameStatesRef: { current: new Map() },
      prevFramesRef: { current: [] },
      rootsRef: { current: new Map() },
      sessionBlurSettingsRef: { current: { amount: 8, blurType: 'gaussian', showBorder: true } },
      sessionCalloutStyleRef: { current: null },
      sessionFocusSettingsRef: { current: { opacity: 0.5, showBorder: false } },
      sessionStepBadgeTemplateRef: { current: null },
      stepBadgeOrderRef: { current: new Map() },
    } as Parameters<typeof useFrameManagerMutations>[1],
    setFrames: vi.fn(),
  };
}

function Harness() {
  const args = currentArgs ?? createArgs();
  latestResult = useFrameManagerMutations(args.setFrames, args.refs, args.recalculateStepBadgesRef);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.logger.log.mockClear();
  mocks.useFrameMutationActions.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestResult = null;
  currentArgs = null;
  vi.unstubAllGlobals();
});

describe('frame-manager-mutations-hook', () => {
  it('routes canonical mutation deps and reports duplicate linked elements through the owner seam', async () => {
    currentArgs = createArgs();
    const element = document.createElement('div');
    currentArgs.refs.linkedElementsRef.current.set('frame-1', element);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness />);
    });

    expect(mocks.useFrameMutationActions).toHaveBeenCalledWith(
      expect.objectContaining({
        containerRef: currentArgs.refs.containerRef,
        highlighterSettingsCacheRef: currentArgs.refs.highlighterSettingsCacheRef,
        linkedElementsRef: currentArgs.refs.linkedElementsRef,
        recalculateStepBadgesRef: currentArgs.recalculateStepBadgesRef,
        rootsRef: currentArgs.refs.rootsRef,
        setFrames: currentArgs.setFrames,
      })
    );
    expect(latestResult?.mutations).toBe(mocks.mutations);
    expect(latestResult?.hasFrameForElement(element)).toBe(true);
    expect(mocks.logger.log).toHaveBeenCalledWith('Element already has a frame', 'frame-1');
    expect(latestResult?.hasFrameForElement(document.createElement('div'))).toBe(false);
  });
});
