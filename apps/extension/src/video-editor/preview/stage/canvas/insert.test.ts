// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoProjectShapeType } from '../../../../features/video/project/types';
import {
  beginPreviewStageCanvasInsertPointer,
  cancelPreviewStageCanvasInsertPointer,
  clearPreviewStageCanvasInsertPointer,
  finishPreviewStageCanvasInsertPointer,
  updatePreviewStageCanvasInsertPointer,
  type VideoPreviewCanvasInsertSession,
} from './insert';
import { createStageRectSpy } from '../runtime/interactions.test-support';

function createParams(kind: 'arrow' | 'line' | 'shape' | 'text') {
  const project = createEmptyVideoProject('Insert');
  project.width = 200;
  project.height = 100;
  const stage = document.createElement('div');
  createStageRectSpy(stage, 400, 200);

  return {
    activeInsertKind: kind,
    camera: {
      focusPoint: { x: 100, y: 50 },
      motionBlurAmount: 0,
      regionId: null,
      scale: 1,
      viewportHeight: 100,
      viewportWidth: 200,
      viewportX: 0,
      viewportY: 0,
    },
    onAddShapeOverlay: vi.fn(() => 'shape-clip'),
    onAddTextOverlay: vi.fn(() => 'text-clip'),
    onClearActiveInsertKind: vi.fn(),
    onSelectClip: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    project,
    stageRef: { current: stage },
  } as const;
}

function createInsertSessionRef() {
  return { current: null } as { current: VideoPreviewCanvasInsertSession | null };
}

function pointerEvent(clientX: number, clientY: number) {
  return {
    pointerId: 1,
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as never;
}

it('inserts text overlays at the clicked preview canvas point', () => {
  const params = createParams('text');
  const insertSessionRef = createInsertSessionRef();
  const onPreviewFrameChange = vi.fn();
  const event = pointerEvent(200, 100);

  expect(
    beginPreviewStageCanvasInsertPointer(event, {
      ...params,
      insertSessionRef,
      onPreviewFrameChange,
    })
  ).toBe(true);
  expect(
    finishPreviewStageCanvasInsertPointer(event, {
      ...params,
      insertSessionRef,
      onPreviewFrameChange,
    })
  ).toBe(true);

  expect(params.onAddTextOverlay).toHaveBeenCalledTimes(1);
  expect(params.onAddShapeOverlay).not.toHaveBeenCalled();
  expect(params.onUpdateClipTransform).toHaveBeenCalledWith('text-clip', {
    height: 20,
    width: 96,
    x: 52,
    y: 40,
  });
  expect(params.onSelectClip).toHaveBeenCalledWith('text-clip');
  expect(params.onClearActiveInsertKind).toHaveBeenCalledTimes(1);
});

it('inserts rectangle overlays from dragged preview canvas geometry', () => {
  const params = createParams('shape');
  const insertSessionRef = createInsertSessionRef();
  const onPreviewFrameChange = vi.fn();
  const startEvent = pointerEvent(20, 10);
  const moveEvent = pointerEvent(220, 110);

  expect(
    beginPreviewStageCanvasInsertPointer(startEvent, {
      ...params,
      insertSessionRef,
      onPreviewFrameChange,
    })
  ).toBe(true);
  expect(
    updatePreviewStageCanvasInsertPointer(moveEvent, {
      ...params,
      insertSessionRef,
      onPreviewFrameChange,
    })
  ).toBe(true);
  expect(
    finishPreviewStageCanvasInsertPointer(moveEvent, {
      ...params,
      insertSessionRef,
      onPreviewFrameChange,
    })
  ).toBe(true);

  expect(params.onAddShapeOverlay).toHaveBeenCalledWith(VideoProjectShapeType.RECTANGLE);
  expect(params.onAddTextOverlay).not.toHaveBeenCalled();
  expect(params.onUpdateClipTransform).toHaveBeenCalledWith('shape-clip', {
    height: 50,
    width: 100,
    x: 10,
    y: 5,
  });
  expect(onPreviewFrameChange).toHaveBeenCalledWith({ height: 50, width: 100, x: 10, y: 5 });
  expect(params.onClearActiveInsertKind).toHaveBeenCalledTimes(1);
});

it('treats single-axis video canvas movement as click placement for box tools', () => {
  const params = createParams('shape');
  const insertSessionRef = createInsertSessionRef();
  const onPreviewFrameChange = vi.fn();
  const startEvent = pointerEvent(20, 10);
  const moveEvent = pointerEvent(220, 10);

  beginPreviewStageCanvasInsertPointer(startEvent, {
    ...params,
    insertSessionRef,
    onPreviewFrameChange,
  });
  updatePreviewStageCanvasInsertPointer(moveEvent, {
    ...params,
    insertSessionRef,
    onPreviewFrameChange,
  });
  finishPreviewStageCanvasInsertPointer(moveEvent, {
    ...params,
    insertSessionRef,
    onPreviewFrameChange,
  });

  expect(params.onAddShapeOverlay).toHaveBeenCalledWith(VideoProjectShapeType.RECTANGLE);
  expect(params.onUpdateClipTransform).toHaveBeenCalledWith('shape-clip', {
    height: 22,
    width: 56,
    x: 0,
    y: 0,
  });
});

it('inserts connector overlays from single-axis canvas drags', () => {
  const params = createParams('arrow');
  const insertSessionRef = createInsertSessionRef();
  const onPreviewFrameChange = vi.fn();
  const startEvent = pointerEvent(20, 10);
  const moveEvent = pointerEvent(220, 10);

  beginPreviewStageCanvasInsertPointer(startEvent, {
    ...params,
    insertSessionRef,
    onPreviewFrameChange,
  });
  updatePreviewStageCanvasInsertPointer(moveEvent, {
    ...params,
    insertSessionRef,
    onPreviewFrameChange,
  });
  finishPreviewStageCanvasInsertPointer(moveEvent, {
    ...params,
    insertSessionRef,
    onPreviewFrameChange,
  });

  expect(params.onAddShapeOverlay).toHaveBeenCalledWith(VideoProjectShapeType.ARROW);
  expect(params.onUpdateClipTransform).toHaveBeenCalledWith('shape-clip', {
    height: 3,
    rotation: 0,
    width: 100,
    x: 10,
    y: 4,
  });
  expect(onPreviewFrameChange).toHaveBeenCalledWith({ height: 2, width: 100, x: 10, y: 4 });
});

it('cancels active video insert sessions through shared lifecycle cleanup', () => {
  const insertSessionRef = {
    current: {
      current: { x: 20, y: 24 },
      kind: 'text',
      origin: { x: 10, y: 12 },
      pointerId: 1,
    } as VideoPreviewCanvasInsertSession,
  };
  const onClearActiveInsertKind = vi.fn();
  const onPreviewFrameChange = vi.fn();

  cancelPreviewStageCanvasInsertPointer({
    insertSessionRef,
    onClearActiveInsertKind,
    onPreviewFrameChange,
  });

  expect(insertSessionRef.current).toBeNull();
  expect(onPreviewFrameChange).toHaveBeenCalledWith(null);
  expect(onClearActiveInsertKind).toHaveBeenCalledTimes(1);
});

it('clears local video insert sessions without toggling the active tool owner', () => {
  const insertSessionRef = {
    current: {
      current: { x: 20, y: 24 },
      kind: 'text',
      origin: { x: 10, y: 12 },
      pointerId: 1,
    } as VideoPreviewCanvasInsertSession,
  };
  const onPreviewFrameChange = vi.fn();

  clearPreviewStageCanvasInsertPointer({
    insertSessionRef,
    onPreviewFrameChange,
  });

  expect(insertSessionRef.current).toBeNull();
  expect(onPreviewFrameChange).toHaveBeenCalledWith(null);
});
