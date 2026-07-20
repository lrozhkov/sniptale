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
});
