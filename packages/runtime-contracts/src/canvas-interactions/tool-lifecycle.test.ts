import { expect, it, vi } from 'vitest';
import {
  beginCanvasToolLifecycle,
  CANVAS_TOOL_MIN_DRAW_SIZE,
  cancelCanvasToolLifecycle,
  createCanvasToolDragPredicate,
  finishCanvasToolLifecycle,
  isBoxCanvasToolDrag,
  isEitherAxisCanvasToolDrag,
  resolveCanvasToolLifecycleCommit,
  updateCanvasToolLifecycle,
  type CanvasToolLifecycleSession,
  type CanvasToolPointerEventLike,
} from './tool-lifecycle';

function pointerEvent(clientX: number, clientY: number): CanvasToolPointerEventLike {
  return {
    clientX,
    clientY,
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function createLifecycleHarness() {
  const sessionRef = { current: null as CanvasToolLifecycleSession<'shape'> | null };
  const onPreviewFrameChange = vi.fn();
  const mapPoint = (event: CanvasToolPointerEventLike) => ({
    x: event.clientX / 2,
    y: event.clientY / 2,
  });

  return {
    mapPoint,
    onCommitClick: vi.fn(),
    onCommitDrag: vi.fn(),
    onPreviewFrameChange,
    sessionRef,
  };
}

function beginShapeLifecycle(harness: ReturnType<typeof createLifecycleHarness>) {
  return beginCanvasToolLifecycle({
    activeKind: 'shape',
    event: pointerEvent(20, 30),
    mapPoint: harness.mapPoint,
    onPreviewFrameChange: harness.onPreviewFrameChange,
    sessionRef: harness.sessionRef,
  });
}

it('runs a shared click and drag lifecycle for canvas insert tools', () => {
  const harness = createLifecycleHarness();

  expect(beginShapeLifecycle(harness)).toBe(true);
  expect(
    updateCanvasToolLifecycle({
      event: pointerEvent(80, 110),
      mapPoint: harness.mapPoint,
      onPreviewFrameChange: harness.onPreviewFrameChange,
      sessionRef: harness.sessionRef,
    })
  ).toBe(true);
  expect(harness.onPreviewFrameChange).toHaveBeenLastCalledWith({
    height: 40,
    width: 30,
    x: 10,
    y: 15,
  });
  expect(
    finishCanvasToolLifecycle({
      event: pointerEvent(80, 110),
      onCommitClick: harness.onCommitClick,
      onCommitDrag: harness.onCommitDrag,
      onPreviewFrameChange: harness.onPreviewFrameChange,
      sessionRef: harness.sessionRef,
    })
  ).toBe(true);
  expect(harness.onCommitDrag).toHaveBeenCalledWith('shape', { x: 10, y: 15 }, { x: 40, y: 55 });
  expect(harness.onCommitClick).not.toHaveBeenCalled();

  expect(beginShapeLifecycle(harness)).toBe(true);
  expect(
    finishCanvasToolLifecycle({
      event: pointerEvent(20, 30),
      onCommitClick: harness.onCommitClick,
      onCommitDrag: harness.onCommitDrag,
      onPreviewFrameChange: harness.onPreviewFrameChange,
      sessionRef: harness.sessionRef,
    })
  ).toBe(true);
  expect(harness.onCommitClick).toHaveBeenCalledWith('shape', { x: 10, y: 15 });
});

it('uses the shared image-editor draw threshold by default', () => {
  const sessionRef = { current: null as CanvasToolLifecycleSession<'shape'> | null };
  const onPreviewFrameChange = vi.fn();
  const onCommitClick = vi.fn();
  const onCommitDrag = vi.fn();
  const mapPoint = (event: CanvasToolPointerEventLike) => ({
    x: event.clientX,
    y: event.clientY,
  });

  beginCanvasToolLifecycle({
    activeKind: 'shape',
    event: pointerEvent(0, 0),
    mapPoint,
    onPreviewFrameChange,
    sessionRef,
  });
  updateCanvasToolLifecycle({
    event: pointerEvent(CANVAS_TOOL_MIN_DRAW_SIZE - 1, 0),
    mapPoint,
    onPreviewFrameChange,
    sessionRef,
  });
  finishCanvasToolLifecycle({
    event: pointerEvent(CANVAS_TOOL_MIN_DRAW_SIZE - 1, 0),
    onCommitClick,
    onCommitDrag,
    onPreviewFrameChange,
    sessionRef,
  });

  expect(onCommitClick).toHaveBeenCalledWith('shape', { x: 0, y: 0 });
  expect(onCommitDrag).not.toHaveBeenCalled();
});

it('lets editor adapters choose box or connector drag activation', () => {
  const flatFrame = { height: 0, width: 24, x: 0, y: 0 };
  const boxFrame = { height: 18, width: 24, x: 0, y: 0 };
  const shouldCommitDrag = createCanvasToolDragPredicate<'line' | 'shape'>({
    connectorKinds: ['line'],
  });

  expect(isEitherAxisCanvasToolDrag({ frame: flatFrame, minDragSize: 8 })).toBe(true);
  expect(isBoxCanvasToolDrag({ frame: flatFrame, minDragSize: 8 })).toBe(false);
  expect(isBoxCanvasToolDrag({ frame: boxFrame, minDragSize: 8 })).toBe(true);
  expect(shouldCommitDrag({ frame: flatFrame, kind: 'line', minDragSize: 8 })).toBe(true);
  expect(shouldCommitDrag({ frame: flatFrame, kind: 'shape', minDragSize: 8 })).toBe(false);
});

it('exposes a shared click-vs-drag commit decision for editor-specific adapters', () => {
  const session = {
    current: { x: 24, y: 0 },
    kind: 'shape',
    origin: { x: 0, y: 0 },
    pointerId: 1,
  } satisfies CanvasToolLifecycleSession<'shape'>;

  expect(
    resolveCanvasToolLifecycleCommit({
      session,
      shouldCommitDrag: ({ frame, minDragSize }) => isBoxCanvasToolDrag({ frame, minDragSize }),
    })
  ).toMatchObject({ commitKind: 'click', frame: { height: 0, width: 24, x: 0, y: 0 } });
  expect(resolveCanvasToolLifecycleCommit({ session })).toMatchObject({ commitKind: 'drag' });
});

it('cancels active tool lifecycle sessions and preview state', () => {
  const sessionRef = {
    current: {
      current: { x: 1, y: 1 },
      kind: 'text',
      origin: { x: 1, y: 1 },
      pointerId: 1,
    },
  };
  const onPreviewFrameChange = vi.fn();

  cancelCanvasToolLifecycle({ onPreviewFrameChange, sessionRef });

  expect(sessionRef.current).toBeNull();
  expect(onPreviewFrameChange).toHaveBeenCalledWith(null);
});
