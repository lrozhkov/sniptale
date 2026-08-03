// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBlurSettingsFixture,
  createBorderSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
} from './test-support';

const domMocks = vi.hoisted(() => ({
  ensureBlurFiltersSvgContainer: vi.fn(),
  registerImmediateBlurOverlayUpdates: vi.fn(() => vi.fn()),
  registerImmediateFocusOverlayUpdates: vi.fn(() => vi.fn()),
  updateBlurOverlayNodes: vi.fn(),
  updateFocusOverlayMask: vi.fn(),
}));

vi.mock('../effect-overlays/dom', () => ({
  ensureBlurFiltersSvgContainer: domMocks.ensureBlurFiltersSvgContainer,
  registerImmediateBlurOverlayUpdates: domMocks.registerImmediateBlurOverlayUpdates,
  registerImmediateFocusOverlayUpdates: domMocks.registerImmediateFocusOverlayUpdates,
  updateBlurOverlayNodes: domMocks.updateBlurOverlayNodes,
  updateFocusOverlayMask: domMocks.updateFocusOverlayMask,
}));

import { useFrameEffectOverlays } from './useFrameEffectOverlays';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createFrame(id: string, effectMode: 'focus' | 'blur'): FrameData {
  return createFrameDataFixture(id, {
    effectMode,
    ...(effectMode === 'focus' ? { focusSettings: createFocusSettingsFixture() } : {}),
    ...(effectMode === 'blur' ? { blurSettings: createBlurSettingsFixture() } : {}),
    height: 120,
    width: 240,
  });
}

function Harness({
  frames,
  presentations = new Map(),
  version = 0,
}: {
  frames: FrameData[];
  presentations?: ReadonlyMap<string, 'visible' | 'offscreen' | 'suspended'>;
  version?: number;
}) {
  const framesRef = useRef(frames);
  framesRef.current = frames;

  useFrameEffectOverlays({
    frames,
    framesRef,
    hostLayoutSnapshot: { presentations, recoveries: [], version },
  });
  return null;
}

async function renderHarness(
  frames: FrameData[],
  presentations?: ReadonlyMap<string, 'visible' | 'offscreen' | 'suspended'>,
  version?: number
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <Harness
        frames={frames}
        {...(presentations === undefined ? {} : { presentations })}
        {...(version === undefined ? {} : { version })}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function expectEquivalentOverlayFramesDoNotRetriggerEffects() {
  const initialFrames = [createFrame('focus-1', 'focus'), createFrame('blur-1', 'blur')];
  const clonedFrames = [createFrame('focus-1', 'focus'), createFrame('blur-1', 'blur')];

  await renderHarness(initialFrames);
  await renderHarness(clonedFrames);

  expect(domMocks.updateFocusOverlayMask).toHaveBeenCalledTimes(1);
  expect(domMocks.updateBlurOverlayNodes).toHaveBeenCalledTimes(1);
  expect(domMocks.registerImmediateFocusOverlayUpdates).toHaveBeenCalledTimes(1);
  expect(domMocks.registerImmediateBlurOverlayUpdates).toHaveBeenCalledTimes(1);
}

async function expectRelevantOverlayChangesRetriggerOnlyTheirOwner() {
  const initialFrames = [createFrame('focus-1', 'focus'), createFrame('blur-1', 'blur')];
  const nextFrames = [
    { ...createFrame('focus-1', 'focus'), focusSettings: { opacity: 0.8, showBorder: false } },
    createFrame('blur-1', 'blur'),
  ] as FrameData[];

  await renderHarness(initialFrames);
  await renderHarness(nextFrames);

  expect(domMocks.updateFocusOverlayMask).toHaveBeenCalledTimes(2);
  expect(domMocks.updateBlurOverlayNodes).toHaveBeenCalledTimes(1);
}

async function expectFocusRadiusChangeRetriggersFocusOwner() {
  const initialFrames = [createFrame('focus-1', 'focus'), createFrame('blur-1', 'blur')];
  const nextFrames = [
    {
      ...createFrame('focus-1', 'focus'),
      borderSettings: createBorderSettingsFixture({ radius: 18 }),
    },
    createFrame('blur-1', 'blur'),
  ];

  await renderHarness(initialFrames);
  await renderHarness(nextFrames);

  expect(domMocks.updateFocusOverlayMask).toHaveBeenCalledTimes(2);
  expect(domMocks.updateBlurOverlayNodes).toHaveBeenCalledTimes(1);
}

async function expectUnmountCleanupRemovesOverlayArtifacts() {
  const focusOverlay = document.createElement('div');
  focusOverlay.className = 'sniptale-focus-overlay';
  const blurOverlay = document.createElement('div');
  blurOverlay.className = 'sniptale-blur-overlay';
  const blurFilters = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  blurFilters.id = 'sniptale-blur-filters-test';
  document.body.append(focusOverlay, blurOverlay, blurFilters);

  await renderHarness([createFrame('focus-1', 'focus')]);

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(document.querySelector('.sniptale-focus-overlay')).toBeNull();
  expect(document.querySelector('.sniptale-blur-overlay')).toBeNull();
  expect(document.querySelector('#sniptale-blur-filters-test')).toBeNull();
}

async function expectSuspensionKeepsEffectsActive() {
  const frames = [createFrame('focus-1', 'focus'), createFrame('blur-1', 'blur')];
  await renderHarness(frames);
  await renderHarness(
    frames,
    new Map([
      ['focus-1', 'offscreen'],
      ['blur-1', 'offscreen'],
    ]),
    1
  );

  expect(domMocks.updateFocusOverlayMask).toHaveBeenLastCalledWith(
    frames,
    expect.any(Object),
    expect.any(Map)
  );
  expect(domMocks.updateBlurOverlayNodes).toHaveBeenLastCalledWith(
    frames,
    expect.any(Object),
    expect.any(Function),
    expect.any(Function)
  );

  await renderHarness(
    frames,
    new Map([
      ['focus-1', 'visible'],
      ['blur-1', 'visible'],
    ]),
    2
  );
  expect(domMocks.updateFocusOverlayMask).toHaveBeenLastCalledWith(
    frames,
    expect.any(Object),
    expect.any(Map)
  );
  expect(domMocks.updateBlurOverlayNodes).toHaveBeenLastCalledWith(
    frames,
    expect.any(Object),
    expect.any(Function),
    expect.any(Function)
  );
}

describe('useFrameEffectOverlays', () => {
  it(
    'does not retrigger overlay updates when equivalent frame descriptors are rerendered',
    expectEquivalentOverlayFramesDoNotRetriggerEffects
  );

  it(
    'retriggers only the changed overlay owner when relevant descriptor fields change',
    expectRelevantOverlayChangesRetriggerOnlyTheirOwner
  );
  it(
    'rebuilds the focus mask when its canonical corner radius changes',
    expectFocusRadiusChangeRetriggersFocusOwner
  );
  it('removes overlay artifacts on unmount cleanup', expectUnmountCleanupRemovesOverlayArtifacts);
  it(
    'keeps focus and blur effects active while anchors are offscreen',
    expectSuspensionKeepsEffectsActive
  );
});
