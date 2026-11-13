// @vitest-environment jsdom
import { Canvas, Point } from 'fabric';
import { afterEach, expect, it, vi } from 'vitest';
import { createTypedTestFixture } from '../../testing/fabric-canvas.test-support';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { stageEditorDrawingObject } from '../../drawing/object/metadata';
import { parseEditorDrawingMetadata } from '../../document/import-boundary';
import type { DrawSession } from '../core/types';
import {
  flushEditorFreehandCompletion,
  hasPendingEditorFreehandCompletion,
} from '../draw-workflow/released';
import {
  releaseFreehandDrawWorkflowFromBindings,
  type DrawCompletionBindings,
} from './draw-completion';
import { createAfterRenderHandler, renderEditorFreehandDraft } from './runtime.render';

const report = vi.hoisted(() => vi.fn());
vi.mock('../../runtime/async-actions', () => ({ reportEditorActionFailure: report }));
const surfaces: Canvas[] = [];
afterEach(() => {
  for (const surface of surfaces.splice(0)) surface.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  report.mockClear();
});
function fixture(kind: 'pencil' | 'marker' = 'pencil') {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => {
    frames.delete(key);
  });
  const canvas = new Canvas(document.createElement('canvas'), {
    width: 240,
    height: 100,
    renderOnAddRemove: false,
  });
  surfaces.push(canvas);
  canvas.cancelRequestedRender();
  frames.clear();
  const initial = {
    kind,
    id: 'released',
    samples: [
      { x: 20, y: 40, t: 0 },
      { x: 80, y: 40, t: 10 },
    ],
    width: 12,
    color: '#ff0000',
    opacity: 0.4,
  };
  const final = { ...initial, samples: [...initial.samples, { x: 180, y: 40, t: 20 }] };
  const object = createEditorDrawingFabricObject(initial, 1);
  object.visible = false;
  object.objectCaching = false;
  canvas.add(object);
  stageEditorDrawingObject(object, final);
  let session: DrawSession | null = {
    tool: kind,
    object,
    objectId: initial.id,
    pointerId: 1,
    start: new Point(20, 40),
    lastPoint: new Point(180, 40),
  };
  const settled = vi.fn();
  const begin = vi.fn(() => settled);
  const commit = vi.fn();
  const bindings = createTypedTestFixture<DrawCompletionBindings>({
    getCanvas: () => canvas,
    getDrawSession: () => session,
    setDrawSession: (next: DrawSession | null) => {
      session = next;
    },
    getCanvasDocumentSize: () => ({ width: 240, height: 100 }),
    setCropState: vi.fn(),
    commitHistory: commit,
    syncRuntimeState: vi.fn(),
    syncHistoryState: vi.fn(),
    beginFreehandCompletion: begin,
  });
  canvas.on('after:render', createAfterRenderHandler(bindings));
  const frame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(0);
  };
  return {
    canvas,
    object,
    bindings,
    settled,
    begin,
    commit,
    frame,
    final,
    setSession: (next: DrawSession | null) => {
      session = next;
    },
  };
}
it.each(['pencil', 'marker'] as const)(
  'stops %s input, retains its tail through native cleanup, then captures the completed source',
  (kind) => {
    const f = fixture(kind);
    renderEditorFreehandDraft(f.bindings);
    expect(releaseFreehandDrawWorkflowFromBindings(f.bindings)).toBe(true);
    expect(f.bindings.getDrawSession()).toBeNull();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.object.visible).toBe(false);
    expect(f.bindings.syncHistoryState).toHaveBeenCalledOnce();
    f.canvas.renderTop();
    expect(f.canvas.contextTop.getImageData(170, 38, 1, 1).data[3]).toBeGreaterThan(0);
    f.frame();
    vi.runOnlyPendingTimers();
    expect(f.commit).not.toHaveBeenCalled();
    f.frame();
    vi.runOnlyPendingTimers();
    expect(f.commit).toHaveBeenCalledOnce();
    expect(f.settled).toHaveBeenCalledOnce();
    expect(parseEditorDrawingMetadata(f.object.sniptaleDrawingJson)).toEqual(f.final);
    expect(f.object.visible).toBe(true);
    expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(false);
    f.frame();
    expect(f.canvas.getContext().getImageData(170, 38, 1, 1).data[3]).toBeGreaterThan(0);
    expect(f.canvas.contextTop.getImageData(170, 38, 1, 1).data[3]).toBe(0);
  }
);
it('supports a completion caller without the optional history projection and activity callbacks', () => {
  const f = fixture();
  delete f.bindings.syncHistoryState;
  delete f.bindings.beginFreehandCompletion;
  releaseFreehandDrawWorkflowFromBindings(f.bindings);
  expect(f.bindings.syncRuntimeState).toHaveBeenCalledOnce();
  flushEditorFreehandCompletion(f.canvas);
  expect(f.commit).toHaveBeenCalledOnce();
});
it('does not publish a released stroke into a replaced canvas', () => {
  const f = fixture();
  releaseFreehandDrawWorkflowFromBindings(f.bindings);
  f.bindings.getCanvas = () => null;
  flushEditorFreehandCompletion(f.canvas);
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.settled).toHaveBeenCalledOnce();
});
it('reports a deferred capture failure and keeps the accepted source for retry', () => {
  const f = fixture();
  f.commit.mockImplementationOnce(() => {
    throw new Error('capture failed');
  });
  releaseFreehandDrawWorkflowFromBindings(f.bindings);
  f.frame();
  f.frame();
  vi.runOnlyPendingTimers();
  expect(report).toHaveBeenCalledWith('freehand-completion', expect.any(Error));
  expect(f.settled).not.toHaveBeenCalled();
  expect(parseEditorDrawingMetadata(f.object.sniptaleDrawingJson)).toEqual(f.final);
  flushEditorFreehandCompletion(f.canvas);
  expect(f.settled).toHaveBeenCalledOnce();
});
it.each(['canvas', 'session', 'object'] as const)(
  'does not queue work without a live %s',
  (missing) => {
    const f = fixture();
    if (missing === 'canvas') f.bindings.getCanvas = () => null;
    else if (missing === 'session') f.setSession(null);
    else {
      const session = { ...f.bindings.getDrawSession()! };
      delete session.object;
      f.setSession(session);
    }
    releaseFreehandDrawWorkflowFromBindings(f.bindings);
    expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(false);
    expect(f.begin).not.toHaveBeenCalled();
  }
);
it('keeps non-freehand completion synchronous', () => {
  const f = fixture();
  f.canvas.remove(f.object);
  const object = createEditorDrawingFabricObject(
    {
      kind: 'rectangle',
      id: 'box',
      bounds: { x: 20, y: 20, width: 100, height: 40 },
      width: 2,
      color: '#111111',
      fillColor: null,
    },
    1
  );
  f.canvas.add(object);
  f.setSession({
    tool: 'shape',
    object,
    objectId: 'box',
    pointerId: 1,
    start: new Point(20, 20),
    lastPoint: new Point(120, 60),
  });
  releaseFreehandDrawWorkflowFromBindings(f.bindings);
  expect(f.commit).toHaveBeenCalledOnce();
  expect(hasPendingEditorFreehandCompletion(f.canvas)).toBe(false);
});
