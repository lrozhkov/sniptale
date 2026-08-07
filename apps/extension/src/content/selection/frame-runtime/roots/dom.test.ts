// @vitest-environment jsdom

import { act, createElement, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { areFrameRenderDescriptorsEqual, buildFrameRenderDescriptors } from './descriptors';
import { renderInteractiveFrames } from './dom';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';

function createCallout() {
  const callout = createDefaultCalloutSettings();
  callout.content.bodyHtml = 'Comment';
  callout.placement = { anchor: 'center', side: 'top' };
  return callout;
}

function createFrame(id: string): FrameData {
  return {
    borderSettings: {
      color: '#000000',
      customCss: '',
      fillColor: '#ffffff',
      fillOpacity: 0,
      sourcePresetId: 'border',
      inheritCustomCss: false,
      sourcePresetName: 'Default Border',
      opacity: 1,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      radius: 6,
      shadow: 0,
      strokeOpacity: 1,
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

function createFrameStates(entries: Array<[string, FrameState]>) {
  return new Map<string, FrameState>(entries);
}

function expectEquivalentFrameDescriptorsAreEqual() {
  const initialFrames = [createFrame('frame-1')];
  const clonedFrames = [createFrame('frame-1')];
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  const initialDescriptors = buildFrameRenderDescriptors(initialFrames, frameStates);
  const clonedDescriptors = buildFrameRenderDescriptors(clonedFrames, frameStates);

  expect(areFrameRenderDescriptorsEqual(initialDescriptors, clonedDescriptors)).toBe(true);
}

function expectFrameStateChangesInvalidateDescriptors() {
  const frames = [createFrame('frame-1')];
  const idleDescriptors = buildFrameRenderDescriptors(
    frames,
    createFrameStates([['frame-1', 'idle']])
  );
  const editingDescriptors = buildFrameRenderDescriptors(
    frames,
    createFrameStates([['frame-1', 'editing']])
  );

  expect(areFrameRenderDescriptorsEqual(idleDescriptors, editingDescriptors)).toBe(false);
}

function expectFrameBorderVisualChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  const changedFrame = createFrame('frame-1');
  changedFrame.borderSettings = { ...changedFrame.borderSettings!, fillOpacity: 45 };
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  const initialDescriptors = buildFrameRenderDescriptors([initialFrame], frameStates);
  const changedDescriptors = buildFrameRenderDescriptors([changedFrame], frameStates);

  expect(areFrameRenderDescriptorsEqual(initialDescriptors, changedDescriptors)).toBe(false);
}

function expectFocusBlurChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.effectMode = 'focus';
  initialFrame.focusSettings = { blurAmount: 0, opacity: 0.5, showBorder: true };
  const changedFrame = structuredClone(initialFrame);
  changedFrame.focusSettings!.blurAmount = 12;
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedFrame], frameStates)
    )
  ).toBe(false);
}

function expectPlacementChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.callout = createCallout();
  initialFrame.callout.placement.manualPlacement = { centerOffsetX: 40, centerOffsetY: -20 };
  initialFrame.callout.placement.connectorBasePosition = 0.25;
  initialFrame.pagePlacement = { iframePath: ['iframe#preview'], pageX: 100, pageY: 200 };
  const changedFrame = structuredClone(initialFrame);
  changedFrame.callout!.placement.manualPlacement!.centerOffsetX = 80;
  changedFrame.pagePlacement!.pageY = 240;
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedFrame], frameStates)
    )
  ).toBe(false);
}

function expectAdditionalCalloutChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.callout = createCallout();
  const addedFrame = structuredClone(initialFrame);
  addedFrame.additionalCallouts = [{ ...createCallout(), instanceId: 'extra-1' }];
  const editedFrame = structuredClone(addedFrame);
  editedFrame.additionalCallouts![0]!.content.bodyHtml = 'Edited extra';
  const removedFrame = structuredClone(editedFrame);
  removedFrame.additionalCallouts = [];
  const frameStates = createFrameStates([['frame-1', 'idle']]);
  const descriptor = (frame: FrameData) => buildFrameRenderDescriptors([frame], frameStates);

  expect(areFrameRenderDescriptorsEqual(descriptor(initialFrame), descriptor(addedFrame))).toBe(
    false
  );
  expect(areFrameRenderDescriptorsEqual(descriptor(addedFrame), descriptor(editedFrame))).toBe(
    false
  );
  expect(areFrameRenderDescriptorsEqual(descriptor(editedFrame), descriptor(removedFrame))).toBe(
    false
  );
}

function expectStepBadgePlacementChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.stepBadge = {
    enabled: true,
    manualPlacement: { position: 0.25, side: 'top' },
    type: 'number',
    value: '1',
  };
  const changedFrame = structuredClone(initialFrame);
  changedFrame.stepBadge!.manualPlacement = { position: 0.75, side: 'bottom' };
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedFrame], frameStates)
    )
  ).toBe(false);
}

function expectStepBadgeStyleChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.stepBadge = {
    enabled: true,
    style: {
      backgroundColor: '#ffffff',
      backgroundColorSource: 'custom',
      diameter: 28,
      outlineColor: '#111111',
      outlineColorSource: 'custom',
      sizeSource: 'custom',
      textColor: '#111111',
      textColorSource: 'custom',
    },
    type: 'number',
    value: '1',
  };
  const changedFrame = structuredClone(initialFrame);
  changedFrame.stepBadge!.style!.diameter = 40;
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedFrame], frameStates)
    )
  ).toBe(false);
}

function expectTailBaseChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.callout = createCallout();
  initialFrame.callout.placement.connectorBasePosition = 0.25;
  initialFrame.callout.placement.connectorBaseWidth = 0.2;
  const changedFrame = structuredClone(initialFrame);
  changedFrame.callout!.placement.connectorBasePosition = 0.75;
  const changedWidthFrame = structuredClone(initialFrame);
  changedWidthFrame.callout!.placement.connectorBaseWidth = 0.4;
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedFrame], frameStates)
    )
  ).toBe(false);
  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedWidthFrame], frameStates)
    )
  ).toBe(false);
}

function expectTailFrameChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.callout = createCallout();
  initialFrame.callout.placement.connectorFramePosition = 0.25;
  const changedFrame = structuredClone(initialFrame);
  changedFrame.callout!.placement.connectorFramePosition = 0.75;
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedFrame], frameStates)
    )
  ).toBe(false);
}

function expectTransientPresentationKeepsTheWholeFrameRoot() {
  const frame = createFrame('frame-1');
  const container = document.createElement('div');
  const frameContainer = document.createElement('div');
  frameContainer.id = 'frame-container-frame-1';
  container.appendChild(frameContainer);
  document.body.appendChild(container);
  const root = { render: vi.fn(), unmount: vi.fn() } satisfies Root;
  const shared = {
    actionRefs: {
      removeFrameRef: { current: vi.fn() },
      updateFrameEffectRef: { current: vi.fn() },
      updateFrameRef: { current: vi.fn() },
      updateFrameStateRef: { current: vi.fn() },
    },
    container,
    currentFrames: [frame],
    currentFrameStates: new Map<string, FrameState>([['frame-1', 'idle']]),
    globalEffectModeRef: { current: 'border' as const },
    InteractiveFrameComponent: vi.fn(() => null),
    rootsRef: { current: new Map([['frame-1', root]]) },
  };

  renderInteractiveFrames({ ...shared, presentations: new Map([['frame-1', 'suspended']]) });
  expect(frameContainer.isConnected).toBe(true);
  expect(root.render).toHaveBeenCalledTimes(1);
  expect(root.unmount).not.toHaveBeenCalled();
  expect(shared.rootsRef.current.has('frame-1')).toBe(true);

  container.remove();
}

async function expectSuspensionUnmountsPortalsAndRestoresFromIdle() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frame = createFrame('frame-1');
  const container = document.createElement('div');
  const frameContainer = document.createElement('div');
  frameContainer.id = 'frame-container-frame-1';
  container.appendChild(frameContainer);
  document.body.appendChild(container);
  const cleanup = vi.fn();
  function PortalFrame() {
    useEffect(() => cleanup, []);
    return createPortal(
      createElement('div', { 'data-testid': 'frame-portal' }, 'Portal frame UI'),
      document.body
    );
  }
  const rootsRef = { current: new Map<string, Root>([['frame-1', createRoot(frameContainer)]]) };
  const shared = {
    actionRefs: {
      removeFrameRef: { current: vi.fn() },
      updateFrameEffectRef: { current: vi.fn() },
      updateFrameRef: { current: vi.fn() },
      updateFrameStateRef: { current: vi.fn() },
    },
    container,
    currentFrames: [frame],
    currentFrameStates: new Map<string, FrameState>([['frame-1', 'idle']]),
    globalEffectModeRef: { current: 'border' as const },
    InteractiveFrameComponent: PortalFrame,
    rootsRef,
  };

  await act(async () => {
    renderInteractiveFrames({ ...shared, presentations: new Map([['frame-1', 'visible']]) });
  });
  expect(document.querySelector('[data-testid="frame-portal"]')).not.toBeNull();

  await act(async () => {
    renderInteractiveFrames({ ...shared, presentations: new Map([['frame-1', 'missing']]) });
  });
  expect(document.querySelector('[data-testid="frame-portal"]')).toBeNull();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(rootsRef.current.has('frame-1')).toBe(false);
  expect(frameContainer.isConnected).toBe(false);
  container.remove();
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('frame-roots-renderer-dom descriptors', () => {
  it(
    'treats equivalent frame descriptors as equal without string serialization',
    expectEquivalentFrameDescriptorsAreEqual
  );
  it(
    'treats frame-state changes as render invalidation',
    expectFrameStateChangesInvalidateDescriptors
  );
  it(
    'treats border visual changes as render invalidation',
    expectFrameBorderVisualChangesInvalidateDescriptors
  );
  it(
    'treats focus blur changes as render invalidation',
    expectFocusBlurChangesInvalidateDescriptors
  );
  it(
    'treats free-frame and manual-callout placement as render invalidation',
    expectPlacementChangesInvalidateDescriptors
  );
  it(
    'treats additional callout add, edit and removal as render invalidation',
    expectAdditionalCalloutChangesInvalidateDescriptors
  );
  it(
    'treats manual step-badge placement as render invalidation',
    expectStepBadgePlacementChangesInvalidateDescriptors
  );
  it(
    'treats step-badge visual style changes as render invalidation',
    expectStepBadgeStyleChangesInvalidateDescriptors
  );
  it(
    'treats tail-base position and width changes as render invalidation',
    expectTailBaseChangesInvalidateDescriptors
  );
  it(
    'treats a tail-frame-only change as render invalidation',
    expectTailFrameChangesInvalidateDescriptors
  );
  it(
    'keeps the entire frame root during transient presentation loss',
    expectTransientPresentationKeepsTheWholeFrameRoot
  );
  it(
    'unmounts portaled interaction effects while an anchor is unavailable',
    expectSuspensionUnmountsPortalsAndRestoresFromIdle
  );
});
