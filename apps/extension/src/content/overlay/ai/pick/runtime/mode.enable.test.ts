import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { AiPickModeState } from './mode.types';

const {
  attachAiPickListenersMock,
  refreshAiPickDomSnapshotMock,
  setupAiPickDomMock,
  teardownAiPickDomMock,
} = vi.hoisted(() => ({
  attachAiPickListenersMock: vi.fn(),
  refreshAiPickDomSnapshotMock: vi.fn(),
  setupAiPickDomMock: vi.fn(),
  teardownAiPickDomMock: vi.fn(),
}));

vi.mock('./dom-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dom-state')>()),
  attachAiPickListeners: attachAiPickListenersMock,
  refreshAiPickDomSnapshot: refreshAiPickDomSnapshotMock,
  setupAiPickDom: setupAiPickDomMock,
  teardownAiPickDom: teardownAiPickDomMock,
}));

import {
  createAiPickModeDisabler,
  createEnableAiPickMode,
  createRefreshAiPickSnapshot,
} from './mode.enable';

function createParsedTree(
  structure: Array<{ id: string; children: [] }> = [{ children: [], id: 'node-1' }]
) {
  return { metadata: {}, structure } as unknown as ParsedDOMTree;
}

function createState(): AiPickModeState {
  return {
    domState: { elementIndex: { token: 'index' } } as never,
    enableSequence: 0,
    isEnabled: false,
    onContentSelect: null,
    parsedTree: null,
    pendingEnable: null,
    source: null,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ai-pick mode disable lifecycle', () => {
  it('returns early from disable when the mode is already idle', () => {
    const state = createState();
    const overlayController = { hideHoverOverlay: vi.fn(), removeOverlayContainer: vi.fn() };

    createAiPickModeDisabler(state as never, overlayController)();

    expect(state.enableSequence).toBe(1);
    expect(teardownAiPickDomMock).not.toHaveBeenCalled();
    expect(overlayController.hideHoverOverlay).not.toHaveBeenCalled();
  });

  it('clears mode state and overlay nodes during disable', () => {
    const state = createState();
    const overlayController = { hideHoverOverlay: vi.fn(), removeOverlayContainer: vi.fn() };
    state.isEnabled = true;
    state.onContentSelect = vi.fn();
    state.parsedTree = createParsedTree();
    state.pendingEnable = Promise.resolve();

    createAiPickModeDisabler(state as never, overlayController)();

    expect(state.isEnabled).toBe(false);
    expect(state.onContentSelect).toBeNull();
    expect(state.parsedTree).toBeNull();
    expect(state.pendingEnable).toBeNull();
    expect(teardownAiPickDomMock).toHaveBeenCalledWith(state.domState);
    expect(overlayController.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(overlayController.removeOverlayContainer).toHaveBeenCalledTimes(1);
  });
});

function registerAiPickEnableModeTests() {
  it('enables ai-pick mode, wires listeners, and clears the pending promise', async () => {
    await expectEnableAiPickModeSuccess();
  });

  it('keeps sibling content modes active when enable initialization fails before startup completes', async () => {
    await expectEnableAiPickModeFailure();
  });

  it('passes active source into parsing and scoped listener attachment', async () => {
    await expectEnableAiPickModeWithSource();
  });
}

function registerAiPickRefreshLifecycleTests() {
  it('refreshes the parsed tree only while ai-pick mode stays enabled', async () => {
    const state = createState();
    const parseDomTree = vi.fn().mockResolvedValue(createParsedTree());
    const refresh = createRefreshAiPickSnapshot(state as never, parseDomTree);

    await refresh();
    expect(parseDomTree).not.toHaveBeenCalled();

    state.isEnabled = true;
    await refresh();

    expect(parseDomTree).toHaveBeenCalledWith('ai-pick-refresh', undefined);
    expect(refreshAiPickDomSnapshotMock).toHaveBeenCalledWith(expect.any(Object), state.domState);
    expect(state.parsedTree).toEqual(expect.any(Object));
  });

  it('ignores stale refresh results after ai-pick mode is disabled during parsing', async () => {
    const state = createState();
    const deferredParse = createDeferred<ParsedDOMTree>();
    const parseDomTree = vi.fn().mockReturnValue(deferredParse.promise);
    const refresh = createRefreshAiPickSnapshot(state as never, parseDomTree);
    state.isEnabled = true;
    state.enableSequence = 1;

    const refreshPromise = refresh();
    state.isEnabled = false;
    state.enableSequence = 2;
    deferredParse.resolve(createParsedTree());
    await refreshPromise;

    expect(state.parsedTree).toBeNull();
    expect(refreshAiPickDomSnapshotMock).not.toHaveBeenCalled();
  });
}

describe('ai-pick mode enable lifecycle', () => {
  registerAiPickEnableModeTests();
  registerAiPickRefreshLifecycleTests();
});

async function expectEnableAiPickModeSuccess() {
  const state = createState();
  const overlayController = { createHoverOverlay: vi.fn(), createOverlayContainer: vi.fn() };
  const parseDomTree = vi.fn().mockResolvedValue(createParsedTree([]));
  const deactivateOtherModes = vi.fn();
  const setModeEnabled = vi.fn();
  const onContentSelect = vi.fn();
  const enable = createEnableAiPickMode({
    deactivateOtherModes,
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handlePointerDown: vi.fn(),
    overlayController: overlayController as never,
    parseDomTree,
    setModeEnabled,
    state: state as never,
  });

  await enable(onContentSelect);

  expect(deactivateOtherModes).toHaveBeenCalledWith('ai-pick');
  expect(parseDomTree).toHaveBeenCalledWith('ai-pick', undefined);
  expect(setupAiPickDomMock).toHaveBeenCalledWith(expect.any(Object), state.domState);
  expect(overlayController.createOverlayContainer).toHaveBeenCalledTimes(1);
  expect(overlayController.createHoverOverlay).toHaveBeenCalledTimes(1);
  expect(attachAiPickListenersMock).toHaveBeenCalledWith(
    state.domState,
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    null
  );
  expect(setModeEnabled).toHaveBeenCalledWith('ai-pick', true);
  expect(state.isEnabled).toBe(true);
  expect(state.onContentSelect).toBe(onContentSelect);
  expect(state.pendingEnable).toBeNull();
}

async function expectEnableAiPickModeWithSource() {
  const state = createState();
  const snapshotSource = { document: {} as Document, root: {} as HTMLElement };
  const source = {
    acceptsTarget: vi.fn(),
    snapshotSource,
  };
  const parseDomTree = vi.fn().mockResolvedValue(createParsedTree());
  const enable = createEnableAiPickMode({
    deactivateOtherModes: vi.fn(),
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handlePointerDown: vi.fn(),
    overlayController: {
      createHoverOverlay: vi.fn(),
      createOverlayContainer: vi.fn(),
    } as never,
    parseDomTree,
    setModeEnabled: vi.fn(),
    state: state as never,
  });

  await enable(vi.fn(), { source: () => source });

  expect(parseDomTree).toHaveBeenCalledWith('ai-pick', snapshotSource);
  expect(attachAiPickListenersMock).toHaveBeenCalledWith(
    state.domState,
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    source
  );
  expect(state.source).toBe(source);
}

async function expectEnableAiPickModeFailure() {
  const state = createState();
  const parseDomTree = vi.fn().mockRejectedValue(new Error('parse failed'));
  const deactivateOtherModes = vi.fn();
  const enable = createEnableAiPickMode({
    deactivateOtherModes,
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handlePointerDown: vi.fn(),
    overlayController: {
      createHoverOverlay: vi.fn(),
      createOverlayContainer: vi.fn(),
    } as never,
    parseDomTree,
    setModeEnabled: vi.fn(),
    state: state as never,
  });

  await expect(enable(vi.fn())).rejects.toThrow('parse failed');
  expect(deactivateOtherModes).not.toHaveBeenCalled();
}
