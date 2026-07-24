import { describe, expect, it } from 'vitest';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import { areFrameRenderDescriptorsEqual, buildFrameRenderDescriptors } from './descriptors';

function createFrame(id: string): FrameData {
  return {
    borderSettings: {
      color: '#000000',
      customCss: '',
      fillColor: '#ffffff',
      fillOpacity: 0,
      id: 'border',
      inheritCustomCss: false,
      isSystemDefault: true,
      name: 'Default Border',
      opacity: 1,
      order: 0,
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

function expectPlacementChangesInvalidateDescriptors() {
  const initialFrame = createFrame('frame-1');
  initialFrame.callout = {
    anchor: 'center',
    bgColor: '#fff',
    enabled: true,
    fontFamily: 'sans',
    fontSize: 14,
    fontWeight: 'normal',
    htmlContent: 'Comment',
    manualPlacement: { centerOffsetX: 40, centerOffsetY: -20 },
    maxWidth: 200,
    side: 'top',
    tailSize: 8,
    tailBasePosition: 0.25,
    textColor: '#111',
    variant: 'bubble',
  };
  initialFrame.pagePlacement = { iframePath: ['iframe#preview'], pageX: 100, pageY: 200 };
  const changedFrame = structuredClone(initialFrame);
  changedFrame.callout!.manualPlacement!.centerOffsetX = 80;
  changedFrame.pagePlacement!.pageY = 240;
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
  initialFrame.callout = {
    anchor: 'center',
    bgColor: '#fff',
    enabled: true,
    fontFamily: 'sans',
    fontSize: 14,
    fontWeight: 'normal',
    htmlContent: 'Comment',
    maxWidth: 200,
    side: 'top',
    tailBasePosition: 0.25,
    tailBaseWidth: 0.2,
    tailSize: 8,
    textColor: '#111',
    variant: 'bubble',
  };
  const changedFrame = structuredClone(initialFrame);
  changedFrame.callout!.tailBasePosition = 0.75;
  const changedWidthFrame = structuredClone(initialFrame);
  changedWidthFrame.callout!.tailBaseWidth = 0.4;
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
  initialFrame.callout = {
    anchor: 'center',
    bgColor: '#fff',
    enabled: true,
    fontFamily: 'sans',
    fontSize: 14,
    fontWeight: 'normal',
    htmlContent: 'Comment',
    maxWidth: 200,
    side: 'top',
    tailFramePosition: 0.25,
    tailSize: 8,
    textColor: '#111',
    variant: 'bubble',
  };
  const changedFrame = structuredClone(initialFrame);
  changedFrame.callout!.tailFramePosition = 0.75;
  const frameStates = createFrameStates([['frame-1', 'idle']]);

  expect(
    areFrameRenderDescriptorsEqual(
      buildFrameRenderDescriptors([initialFrame], frameStates),
      buildFrameRenderDescriptors([changedFrame], frameStates)
    )
  ).toBe(false);
}

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
    'treats free-frame and manual-callout placement as render invalidation',
    expectPlacementChangesInvalidateDescriptors
  );
  it(
    'treats tail-base position and width changes as render invalidation',
    expectTailBaseChangesInvalidateDescriptors
  );
  it(
    'treats a tail-frame-only change as render invalidation',
    expectTailFrameChangesInvalidateDescriptors
  );
});
