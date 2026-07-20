// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createRefs() {
  return {
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
  };
}

function createFrameManager() {
  return {
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
}

const mocks = vi.hoisted(() => {
  const refs = createRefs();
  const bridge = {
    applySnapshot: vi.fn(),
    captureSnapshot: vi.fn(),
  };
  const withHistoryCommit = vi.fn(<T extends (...args: never[]) => unknown>(action: T) => action);
  const frameManager = createFrameManager();
  const wrappedFrameManager = {
    ...frameManager,
    wrapped: true,
  };

  return {
    bridge,
    createHistoryWrappedFrameManager: vi.fn(() => wrappedFrameManager),
    createPagePreparationHistoryBridge: vi.fn(() => bridge),
    frameManager,
    refs,
    registerBridge: vi.fn(),
    syncFrameManagerStateRefs: vi.fn(),
    unregisterBridge: vi.fn(),
    useFrameContainer: vi.fn(),
    useFrameManagerControllers: vi.fn(() => frameManager),
    useFrameManagerRefs: vi.fn(() => refs),
    useHistoryCommitCoordinator: vi.fn(() => withHistoryCommit),
    withHistoryCommit,
    wrappedFrameManager,
  };
});

vi.mock('../../../parser/page-preparation/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/history')>()),
  pagePreparationHistory: {
    registerBridge: mocks.registerBridge,
    unregisterBridge: mocks.unregisterBridge,
  },
}));

vi.mock('./useFrameManagerRefs', () => ({
  syncFrameManagerStateRefs: mocks.syncFrameManagerStateRefs,
  useFrameContainer: mocks.useFrameContainer,
  useFrameManagerRefs: mocks.useFrameManagerRefs,
}));

vi.mock('./useFrameManagerControllers', () => ({
  useFrameManagerControllers: mocks.useFrameManagerControllers,
}));

vi.mock('../history/bridge', () => ({
  applyHistorySnapshotToFrameManager: vi.fn(),
  createPagePreparationHistoryBridge: mocks.createPagePreparationHistoryBridge,
}));

vi.mock('./useFrameHistoryCommit', () => ({
  createHistoryWrappedFrameManager: mocks.createHistoryWrappedFrameManager,
  useHistoryCommitCoordinator: mocks.useHistoryCommitCoordinator,
}));

import { useFrameManager } from './useFrameManager';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestManager: ReturnType<typeof useFrameManager> | null = null;
const InteractiveFrameComponent = vi.fn(() => null);

function Harness() {
  latestManager = useFrameManager({ InteractiveFrameComponent });
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

describe('useFrameManager', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.createHistoryWrappedFrameManager.mockClear();
    mocks.createPagePreparationHistoryBridge.mockClear();
    mocks.registerBridge.mockClear();
    mocks.syncFrameManagerStateRefs.mockClear();
    mocks.unregisterBridge.mockClear();
    mocks.useFrameManagerControllers.mockClear();
    mocks.useFrameManagerRefs.mockClear();
    mocks.useHistoryCommitCoordinator.mockClear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    latestManager = null;
    vi.unstubAllGlobals();
  });

  it(
    'orchestrates refs, history bridge registration, and wrapped frame-manager ownership',
    expectFrameManagerOrchestration
  );
});

async function expectFrameManagerOrchestration() {
  await renderHarness();

  expect(mocks.syncFrameManagerStateRefs).toHaveBeenCalledWith([], new Map(), mocks.refs);
  expect(mocks.useHistoryCommitCoordinator).toHaveBeenCalledWith([]);
  expect(mocks.useFrameManagerControllers).toHaveBeenCalledWith({
    frames: [],
    InteractiveFrameComponent,
    refs: mocks.refs,
    setFrames: expect.any(Function),
    setFrameStates: expect.any(Function),
    withHistoryCommit: mocks.withHistoryCommit,
  });
  expect(mocks.createPagePreparationHistoryBridge).toHaveBeenCalledWith({
    refs: mocks.refs,
    setFrames: expect.any(Function),
    setFrameStates: expect.any(Function),
  });
  expect(mocks.createHistoryWrappedFrameManager).toHaveBeenCalledWith(
    mocks.frameManager,
    mocks.withHistoryCommit
  );
  expect(mocks.registerBridge).toHaveBeenCalledWith(mocks.bridge);
  expect(latestManager).toBe(mocks.wrappedFrameManager);

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(mocks.unregisterBridge).toHaveBeenCalledWith(mocks.bridge);
}
