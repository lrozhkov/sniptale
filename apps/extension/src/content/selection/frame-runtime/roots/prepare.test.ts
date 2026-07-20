// @vitest-environment jsdom

import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameState } from '../../../../features/highlighter/contracts';

const prepareMocks = vi.hoisted(() => ({
  applyIsolatedContentRootStyle: vi.fn(),
  buildFrameRenderDescriptors: vi.fn(),
  createRoot: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('react-dom/client', async () => {
  const actual = await vi.importActual<typeof import('react-dom/client')>('react-dom/client');

  return {
    ...actual,
    createRoot: prepareMocks.createRoot,
  };
});

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: prepareMocks.loggerError,
  }),
}));

vi.mock('../../../platform/dom-host/isolated', () => ({
  applyIsolatedContentRootStyle: prepareMocks.applyIsolatedContentRootStyle,
}));

vi.mock('./descriptors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./descriptors')>()),
  areFrameRenderDescriptorsEqual: vi.fn(() => false),
  buildFrameRenderDescriptors: prepareMocks.buildFrameRenderDescriptors,
}));

import { prepareFrameRootsRender } from './prepare';

function createFrame(id: string) {
  return {
    borderSettings: {
      color: '#000',
      customCss: '',
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      strokeOpacity: 100,
      id: 'border',
      isSystemDefault: true,
      name: 'Default',
      opacity: 1,
      order: 0,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      radius: 4,
      shadow: 0,
      style: 'solid' as const,
      width: 2,
    },
    effectMode: 'border' as const,
    height: 40,
    id,
    width: 80,
    x: 0,
    y: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function createRootStub() {
  return {
    render: vi.fn<(children: ReactNode) => void>(),
    unmount: vi.fn<() => void>(),
  } satisfies Root;
}

function appendFrameContainer(container: HTMLDivElement, frameId: string) {
  const frameContainer = document.createElement('div');
  frameContainer.id = `frame-container-${frameId}`;
  container.appendChild(frameContainer);
  return frameContainer;
}

function expectRemovedFrameRootUnmountsAfterRenderTick() {
  vi.useFakeTimers();
  const container = document.createElement('div');
  document.body.appendChild(container);
  appendFrameContainer(container, 'frame-2');
  const removedRoot = createRootStub();
  const currentRoot = createRootStub();
  prepareMocks.createRoot.mockReturnValue(currentRoot);
  prepareMocks.buildFrameRenderDescriptors.mockReturnValue([{ frameId: 'frame-1' }]);

  const rootsRef = {
    current: new Map<string, Root>([['frame-2', removedRoot]]),
  };

  prepareFrameRootsRender({
    currentFrameStates: new Map<string, FrameState>([['frame-1', 'idle']]),
    framesRef: { current: [createFrame('frame-1')] },
    getOrCreateContainer: () => container,
    isClearingRef: { current: false },
    prevRenderDescriptorsRef: { current: [] },
    rootsRef,
  });

  expect(removedRoot.unmount).not.toHaveBeenCalled();
  expect(rootsRef.current.has('frame-2')).toBe(false);
  expect(document.getElementById('frame-container-frame-2')).toBeNull();

  vi.runOnlyPendingTimers();

  expect(removedRoot.unmount).toHaveBeenCalledTimes(1);
  expect(prepareMocks.createRoot).toHaveBeenCalledTimes(1);
}

function expectDeferredUnmountErrorsAreLogged() {
  vi.useFakeTimers();
  const container = document.createElement('div');
  document.body.appendChild(container);
  appendFrameContainer(container, 'frame-1');
  const removedRoot = createRootStub();
  removedRoot.unmount = vi.fn(() => {
    throw new Error('unmount failed');
  });

  prepareFrameRootsRender({
    currentFrameStates: new Map<string, FrameState>(),
    framesRef: { current: [] },
    getOrCreateContainer: () => container,
    isClearingRef: { current: false },
    prevRenderDescriptorsRef: { current: [] },
    rootsRef: { current: new Map<string, Root>([['frame-1', removedRoot]]) },
  });

  expect(prepareMocks.loggerError).not.toHaveBeenCalled();
  vi.runOnlyPendingTimers();

  expect(prepareMocks.loggerError).toHaveBeenCalledWith('Error unmounting root', expect.any(Error));
}

function expectRendererSkipsClearingAndDetachedContainer() {
  const detachedContainer = document.createElement('div');

  expect(
    prepareFrameRootsRender({
      currentFrameStates: new Map<string, FrameState>(),
      framesRef: { current: [createFrame('frame-1')] },
      getOrCreateContainer: () => detachedContainer,
      isClearingRef: { current: true },
      prevRenderDescriptorsRef: { current: [] },
      rootsRef: { current: new Map<string, Root>() },
    })
  ).toBeNull();

  expect(
    prepareFrameRootsRender({
      currentFrameStates: new Map<string, FrameState>(),
      framesRef: { current: [createFrame('frame-1')] },
      getOrCreateContainer: () => detachedContainer,
      isClearingRef: { current: false },
      prevRenderDescriptorsRef: { current: [] },
      rootsRef: { current: new Map<string, Root>() },
    })
  ).toBeNull();
}

function expectMissingFrameRootsRenderState() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const rootStub = createRootStub();
  prepareMocks.createRoot.mockReturnValue(rootStub);
  prepareMocks.buildFrameRenderDescriptors.mockReturnValue([{ frameId: 'frame-1' }]);

  const renderState = prepareFrameRootsRender({
    currentFrameStates: new Map<string, FrameState>([['frame-1', 'idle']]),
    framesRef: { current: [createFrame('frame-1')] },
    getOrCreateContainer: () => container,
    isClearingRef: { current: false },
    prevRenderDescriptorsRef: { current: [] },
    rootsRef: { current: new Map<string, Root>() },
  });

  expect(prepareMocks.createRoot).toHaveBeenCalledTimes(1);
  expect(prepareMocks.applyIsolatedContentRootStyle).toHaveBeenCalledTimes(1);
  expect(renderState?.container).toBe(container);
  expect(renderState?.currentFrames).toHaveLength(1);
}

function registerPrepareFrameRootsRenderTests() {
  it(
    'returns null when the renderer is clearing or the container is detached',
    expectRendererSkipsClearingAndDetachedContainer
  );
  it(
    'creates missing frame roots and returns the prepared render state',
    expectMissingFrameRootsRenderState
  );
  it(
    'defers unmounting removed frame roots until after the current render tick',
    expectRemovedFrameRootUnmountsAfterRenderTick
  );
  it('logs deferred removed root unmount failures', expectDeferredUnmountErrorsAreLogged);
}

describe('frame-roots-renderer-prepare', () => {
  registerPrepareFrameRootsRenderTests();
});
