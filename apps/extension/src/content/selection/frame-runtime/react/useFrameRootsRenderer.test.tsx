// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectMode, FrameData, FrameState } from '../../../../features/highlighter/contracts';

const domMocks = vi.hoisted(() => ({
  renderInteractiveFrames: vi.fn(),
}));

vi.mock('../roots/dom', async () => {
  const actual = await vi.importActual<typeof import('../roots/dom')>('../roots/dom');

  return {
    ...actual,
    renderInteractiveFrames: domMocks.renderInteractiveFrames,
  };
});

import { useFrameRootsRenderer } from './useFrameRootsRenderer';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let hostContainer: HTMLDivElement | null = null;

function createFrame(id: string): FrameData {
  return {
    borderSettings: {
      color: '#000000',
      customCss: '',
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      strokeOpacity: 100,
      id: 'border',
      isSystemDefault: true,
      name: 'Default Border',
      opacity: 1,
      order: 0,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      radius: 6,
      shadow: 0,
      style: 'solid',
      width: 2,
    },
    effectMode: 'border',
    height: 80,
    id,
    width: 120,
    x: 10,
    y: 20,
  };
}

type HarnessProps = {
  frames: FrameData[];
  frameStates: Map<string, FrameState>;
  isClearing?: boolean;
  removeFrame: (frameId: string) => void;
  updateFrame: (frameId: string, frame: FrameData) => void;
  updateFrameEffect: (frameId: string, mode: EffectMode) => void;
  updateFrameState: (frameId: string, state: FrameState) => void;
};
const InteractiveFrameComponent = vi.fn(() => null);

function Harness(props: HarnessProps) {
  const framesRef = useRef(props.frames);
  const frameStatesRef = useRef(props.frameStates);
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const isClearingRef = useRef(Boolean(props.isClearing));
  const globalEffectModeRef = useRef<EffectMode>('border');
  const hostRef = useRef<HTMLDivElement | null>(null);

  framesRef.current = props.frames;
  frameStatesRef.current = props.frameStates;
  isClearingRef.current = Boolean(props.isClearing);

  useFrameRootsRenderer({
    containerRef: hostRef,
    frameStatesRef,
    frames: props.frames,
    framesRef,
    InteractiveFrameComponent,
    getOrCreateContainer: () => {
      if (!hostRef.current) {
        hostRef.current = document.createElement('div');
        document.body.appendChild(hostRef.current);
        hostContainer = hostRef.current;
      }
      return hostRef.current;
    },
    globalEffectModeRef,
    isClearingRef,
    removeFrame: props.removeFrame,
    rootsRef,
    updateFrame: props.updateFrame,
    updateFrameEffect: props.updateFrameEffect,
    updateFrameState: props.updateFrameState,
  });

  return null;
}

async function renderHarness(props: HarnessProps) {
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
  hostContainer = null;
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  hostContainer?.remove();
  hostContainer = null;
  document
    .querySelectorAll('[id^="frame-container-"]')
    .forEach((frameContainer) => frameContainer.remove());
  vi.restoreAllMocks();
});

function createProps() {
  return {
    frameStates: new Map<string, FrameState>([['frame-1', 'idle']]),
    frames: [createFrame('frame-1')],
    removeFrame: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
    updateFrameState: vi.fn(),
  };
}

async function expectStableActionRefsDoNotRetriggerRootRendering() {
  const props = createProps();

  await renderHarness(props);
  await renderHarness({
    ...props,
    removeFrame: vi.fn(),
    updateFrame: vi.fn(),
    updateFrameEffect: vi.fn(),
    updateFrameState: vi.fn(),
  });

  expect(domMocks.renderInteractiveFrames).toHaveBeenCalledTimes(1);
}

async function expectEquivalentFrameClonesDoNotRetriggerRootRendering() {
  const props = createProps();

  await renderHarness(props);
  await renderHarness({
    ...props,
    frames: [createFrame('frame-1')],
  });

  expect(domMocks.renderInteractiveFrames).toHaveBeenCalledTimes(1);
}

async function expectFrameStateChangesRetriggerRootRendering() {
  const props = createProps();

  await renderHarness(props);
  await renderHarness({
    ...props,
    frameStates: new Map<string, FrameState>([['frame-1', 'editing']]),
  });

  expect(domMocks.renderInteractiveFrames).toHaveBeenCalledTimes(2);
}

async function expectUnmountCleanupDoesNotCreateAContainerWhenRuntimeNeverMountedOne() {
  const props = createProps();

  await renderHarness({
    ...props,
    frames: [],
    isClearing: true,
  });

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(hostContainer).toBeNull();
}

describe('useFrameRootsRenderer', () => {
  it(
    'does not rerender frame roots when only action callback identities change',
    expectStableActionRefsDoNotRetriggerRootRendering
  );
  it(
    'does not rerender frame roots when equivalent frame clones are passed back in',
    expectEquivalentFrameClonesDoNotRetriggerRootRendering
  );
  it(
    'rerenders frame roots when frame state changes even without frame geometry changes',
    expectFrameStateChangesRetriggerRootRendering
  );
  it(
    'does not create a frame container during unmount cleanup when rendering never acquired one',
    expectUnmountCleanupDoesNotCreateAContainerWhenRuntimeNeverMountedOne
  );
});
