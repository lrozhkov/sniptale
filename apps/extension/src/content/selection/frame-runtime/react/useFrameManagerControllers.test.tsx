// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mutations = {
    addFrame: vi.fn(),
    clearFrames: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
  };
  const publicResult = {
    addFrame: vi.fn(),
    clearFrames: vi.fn(),
    frames: [],
    getGlobalStepBadgeSettings: vi.fn(),
    hasFrameForElement: vi.fn(),
    recalculateStepBadges: vi.fn(),
    removeFrame: vi.fn(),
    syncFocusOpacity: vi.fn(),
    syncAutoBlurFrames: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
    updateFrameStepBadge: vi.fn(),
    updateGlobalStepBadgeSettings: vi.fn(),
  };

  return {
    createReorderStepBadge: vi.fn(() => vi.fn()),
    createUpdateFrameStepBadge: vi.fn(() => vi.fn()),
    createUpdateGlobalStepBadgeSettings: vi.fn(() => vi.fn()),
    mutations,
    publicResult,
    useFrameManagerMutations: vi.fn(() => ({
      hasFrameForElement: vi.fn(),
      mutations,
    })),
    useFrameManagerPublicResult: vi.fn<
      (args: { getGlobalStepBadgeSettings: () => unknown }) => typeof publicResult
    >(() => publicResult),
    useFrameManagerRuntimeSyncEffects: vi.fn(),
    useFrameManagerSessionEffects: vi.fn(),
  };
});
const InteractiveFrameComponent = vi.fn(() => null);

vi.mock('../manager/step-badge/update', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../manager/step-badge/update')>()),
  createUpdateFrameStepBadge: mocks.createUpdateFrameStepBadge,
  createUpdateGlobalStepBadgeSettings: mocks.createUpdateGlobalStepBadgeSettings,
}));

vi.mock('../manager/step-badge/reorder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../manager/step-badge/reorder')>()),
  createReorderStepBadge: mocks.createReorderStepBadge,
}));

vi.mock('./useFrameManagerMutations', async () => {
  const actual = await vi.importActual<typeof import('./useFrameManagerMutations')>(
    './useFrameManagerMutations'
  );

  return {
    ...actual,
    useFrameManagerMutations: mocks.useFrameManagerMutations,
  };
});

vi.mock('./useFrameManagerPublicResult', async () => {
  const actual = await vi.importActual<typeof import('./useFrameManagerPublicResult')>(
    './useFrameManagerPublicResult'
  );

  return {
    ...actual,
    useFrameManagerPublicResult: mocks.useFrameManagerPublicResult,
  };
});

vi.mock('./useFrameManagerSessionEffects', async () => {
  const actual = await vi.importActual<typeof import('./useFrameManagerSessionEffects')>(
    './useFrameManagerSessionEffects'
  );

  return {
    ...actual,
    useFrameManagerSessionEffects: mocks.useFrameManagerSessionEffects,
  };
});

vi.mock('./useFrameManagerRuntimeSyncEffects', async () => {
  const actual = await vi.importActual<typeof import('./useFrameManagerRuntimeSyncEffects')>(
    './useFrameManagerRuntimeSyncEffects'
  );

  return {
    ...actual,
    useFrameManagerRuntimeSyncEffects: mocks.useFrameManagerRuntimeSyncEffects,
  };
});

import { useFrameManagerControllers } from './useFrameManagerControllers';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestResult: ReturnType<typeof useFrameManagerControllers> | null = null;
let currentArgs: Parameters<typeof useFrameManagerControllers>[0] | null = null;

function createArgs(): Parameters<typeof useFrameManagerControllers>[0] {
  return {
    frames: [],
    InteractiveFrameComponent,
    refs: {
      containerRef: { current: null },
      frameStatesRef: { current: new Map() },
      framesRef: { current: [] },
      globalEffectModeRef: { current: 'border' },
      globalStepBadgeAutoModeRef: { current: false },
      globalStepBadgeSettingsRef: {
        current: {
          autoMode: false,
        },
      },
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
    } as unknown as Parameters<typeof useFrameManagerControllers>[0]['refs'],
    setFrameStates: vi.fn(),
    setFrames: vi.fn(),
    withHistoryCommit: (<T extends (...args: never[]) => unknown>(action: T) =>
      action) as Parameters<typeof useFrameManagerControllers>[0]['withHistoryCommit'],
  };
}

function Harness() {
  latestResult = useFrameManagerControllers(currentArgs ?? createArgs());
  return null;
}

async function renderHarness(args = createArgs()) {
  currentArgs = args;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });

  return args;
}

function expectEffectOwnersCalled(args: Parameters<typeof useFrameManagerControllers>[0]) {
  expect(mocks.useFrameManagerMutations).toHaveBeenCalledWith(
    args.setFrames,
    args.refs,
    expect.any(Object)
  );
  expect(mocks.useFrameManagerSessionEffects).toHaveBeenCalledWith(
    expect.objectContaining({
      refs: args.refs,
      reorderStepBadge: expect.any(Function),
      setFrames: args.setFrames,
      syncFocusOpacity: mocks.mutations.syncFocusOpacity,
      updateFrameStepBadge: expect.any(Function),
      updateGlobalStepBadgeSettings: expect.any(Function),
      withHistoryCommit: args.withHistoryCommit,
    })
  );
  expect(mocks.useFrameManagerRuntimeSyncEffects).toHaveBeenCalledWith(
    expect.objectContaining({
      frames: args.frames,
      InteractiveFrameComponent: args.InteractiveFrameComponent,
      mutations: mocks.mutations,
      refs: args.refs,
      setFrameStates: args.setFrameStates,
      setFrames: args.setFrames,
      withHistoryCommit: args.withHistoryCommit,
    })
  );
}

function expectPublicResultOwnerCalled(args: Parameters<typeof useFrameManagerControllers>[0]) {
  expect(mocks.useFrameManagerPublicResult).toHaveBeenCalledWith(
    expect.objectContaining({
      addFrame: mocks.mutations.addFrame,
      clearFrames: mocks.mutations.clearFrames,
      frames: args.frames,
      hasFrameForElement: expect.any(Function),
      recalculateStepBadges: expect.any(Function),
      removeFrame: mocks.mutations.removeFrame,
      syncFocusOpacity: mocks.mutations.syncFocusOpacity,
      updateFrame: mocks.mutations.updateFrame,
      updateFrameEffect: mocks.mutations.updateFrameEffect,
      updateFrameStepBadge: expect.any(Function),
      updateGlobalStepBadgeSettings: expect.any(Function),
    })
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.createReorderStepBadge.mockClear();
  mocks.createUpdateFrameStepBadge.mockClear();
  mocks.createUpdateGlobalStepBadgeSettings.mockClear();
  mocks.mutations.addFrame.mockClear();
  mocks.mutations.clearFrames.mockClear();
  mocks.mutations.removeFrame.mockClear();
  mocks.mutations.syncFocusOpacity.mockClear();
  mocks.mutations.updateFrame.mockClear();
  mocks.mutations.updateFrameEffect.mockClear();
  mocks.useFrameManagerMutations.mockClear();
  mocks.useFrameManagerPublicResult.mockClear();
  mocks.useFrameManagerRuntimeSyncEffects.mockClear();
  mocks.useFrameManagerSessionEffects.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentArgs = null;
  latestResult = null;
  vi.unstubAllGlobals();
});

describe('useFrameManagerControllers', () => {
  it('routes narrowed frame-manager seams into session, runtime-sync, and public-result owners', async () => {
    const args = await renderHarness();

    expectEffectOwnersCalled(args);
    expectPublicResultOwnerCalled(args);

    const publicResultArgs = mocks.useFrameManagerPublicResult.mock.calls[0]?.[0];
    expect(publicResultArgs?.getGlobalStepBadgeSettings()).toBe(
      args.refs.globalStepBadgeSettingsRef.current
    );
    expect(latestResult).toBe(mocks.publicResult);
  });
});
