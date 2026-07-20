// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRuntimeHistoryWrappedMutations: vi.fn((mutations) => mutations),
  runtimeMutations: {
    addAutoBlurFrames: vi.fn(),
    addFrame: vi.fn(),
    clearAutoBlurFrames: vi.fn(),
    clearFrames: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
  },
  useFrameContainer: vi.fn(() => vi.fn()),
  syncFrameManagerStateRefs: vi.fn(),
  useFrameManagerRefs: vi.fn(),
  useFrameManagerRuntimeSync: vi.fn(),
}));

vi.mock('../manager/runtime-mutations', () => ({
  createRuntimeHistoryWrappedMutations: mocks.createRuntimeHistoryWrappedMutations,
}));

vi.mock('./useFrameManagerRefs', () => ({
  syncFrameManagerStateRefs: mocks.syncFrameManagerStateRefs,
  useFrameContainer: mocks.useFrameContainer,
  useFrameManagerRefs: mocks.useFrameManagerRefs,
}));

vi.mock('./useFrameManagerRuntimeSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useFrameManagerRuntimeSync')>()),
  useFrameManagerRuntimeSync: mocks.useFrameManagerRuntimeSync,
}));

import { useFrameManagerRuntimeSyncEffects } from './useFrameManagerRuntimeSyncEffects';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentArgs: Parameters<typeof useFrameManagerRuntimeSyncEffects>[0] | null = null;
const InteractiveFrameComponent = vi.fn(() => null);

function createArgs(): Parameters<typeof useFrameManagerRuntimeSyncEffects>[0] {
  const mutations = {
    addAutoBlurFrames: vi.fn(),
    addFrame: vi.fn(),
    clearAutoBlurFrames: vi.fn(),
    clearFrames: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
  };

  return {
    frames: [],
    InteractiveFrameComponent,
    mutations,
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
    } as Parameters<typeof useFrameManagerRuntimeSyncEffects>[0]['refs'],
    setFrameStates: vi.fn(),
    setFrames: vi.fn(),
    withHistoryCommit: (<T extends (...args: never[]) => unknown>(action: T) =>
      action) as Parameters<typeof useFrameManagerRuntimeSyncEffects>[0]['withHistoryCommit'],
  };
}

function Harness() {
  useFrameManagerRuntimeSyncEffects(currentArgs ?? createArgs());
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.createRuntimeHistoryWrappedMutations.mockClear();
  mocks.useFrameContainer.mockClear();
  mocks.useFrameManagerRuntimeSync.mockClear();
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

describe('frame-manager-runtime-sync-effects', () => {
  it('wires runtime history wrappers, container access, and runtime sync into one owner seam', async () => {
    currentArgs = createArgs();
    mocks.createRuntimeHistoryWrappedMutations.mockReturnValue(mocks.runtimeMutations);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness />);
    });

    expect(mocks.createRuntimeHistoryWrappedMutations).toHaveBeenCalledWith(
      currentArgs.mutations,
      currentArgs.withHistoryCommit
    );
    expect(mocks.useFrameContainer).toHaveBeenCalledWith(currentArgs.refs.containerRef);
    expect(mocks.useFrameManagerRuntimeSync).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.objectContaining({
          InteractiveFrameComponent,
          mutations: mocks.runtimeMutations,
        }),
        refs: expect.objectContaining({
          containerRef: currentArgs.refs.containerRef,
          framesRef: currentArgs.refs.framesRef,
          frameStatesRef: currentArgs.refs.frameStatesRef,
          linkedElementsRef: currentArgs.refs.linkedElementsRef,
        }),
        state: {
          frames: currentArgs.frames,
          setFrameStates: currentArgs.setFrameStates,
          setFrames: currentArgs.setFrames,
        },
      })
    );
  });
});
