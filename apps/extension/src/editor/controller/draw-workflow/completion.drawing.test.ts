// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Canvas, Point, Textbox } from 'fabric';
import {
  createEditorDrawingFabricObject,
  updateEditorDrawingShapeDraft,
} from '../../drawing/object/vector';
import type { DrawingObject } from '../../../features/drawing/public';
import { createCompletedDrawWorkflowState } from './completion-complete';
import { parseEditorDrawingMetadata } from '../../document/import-boundary';
import { stageEditorDrawingObject } from '../../drawing/object/metadata';
import { completeEditorDrawWorkflow } from './completion';
import type { DrawSession } from '../core/types';
import { createAfterRenderHandler, renderEditorFreehandDraft } from '../events/runtime.render';
import { createBeforeRenderHandler } from '../events/runtime.canvas';

function canvas() {
  const surface = new Canvas(document.createElement('canvas'));
  Object.defineProperties(surface, {
    discardActiveObject: { configurable: true, value: vi.fn(() => surface) },
    requestRenderAll: { configurable: true, value: vi.fn(() => surface) },
    setActiveObject: { configurable: true, value: vi.fn(() => true) },
  });
  return surface;
}

describe('drawing completion history', () => {
  it('does nothing without a mounted canvas or active object', () => {
    expect(
      completeEditorDrawWorkflow({
        canvas: null,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: vi.fn(),
        drawSession: null,
        minDrawSize: 8,
        syncRuntimeState: vi.fn(),
      })
    ).toBeNull();
  });

  it('commits a completed vector object exactly once', () => {
    const drawing: DrawingObject = {
      id: 'shape-1',
      kind: 'rectangle',
      bounds: { x: 10, y: 10, width: 80, height: 40 },
      color: '#f97316',
      fillColor: null,
      width: 4,
    };
    const object = createEditorDrawingFabricObject(drawing, 1);
    const surface = canvas();
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    createCompletedDrawWorkflowState(
      surface,
      { kind: 'complete', completedTool: 'shape', drawSession: null, object },
      commitHistory,
      syncRuntimeState
    );
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
    expect(surface.setActiveObject).toHaveBeenCalledWith(object);
    expect(object.borderColor).toBe('#2563eb');
    expect(object.borderDashArray).toBeNull();
    expect(Object.keys(object.controls)).toEqual([
      'tl',
      'mt',
      'tr',
      'mr',
      'br',
      'mb',
      'bl',
      'ml',
      'mtr',
    ]);
  });

  it('commits final geometric draft bounds into serialized metadata before history', () => {
    const initial: DrawingObject = {
      id: 'shape-2',
      kind: 'ellipse',
      bounds: { x: 5, y: 6, width: 2, height: 2 },
      color: '#f97316',
      fillColor: null,
      width: 4,
    };
    const final = { ...initial, bounds: { x: 5, y: 6, width: 80, height: 40 } };
    const object = createEditorDrawingFabricObject(initial, 1);
    expect(updateEditorDrawingShapeDraft(object, final)).toBe(true);
    const surface = canvas();

    createCompletedDrawWorkflowState(
      surface,
      { kind: 'complete', completedTool: 'shape', drawSession: null, object },
      vi.fn(),
      vi.fn()
    );

    const persisted = parseEditorDrawingMetadata(object.sniptaleDrawingJson);
    expect(persisted).toEqual(final);
    if (!persisted || persisted.kind === 'blur') {
      throw new Error('Expected completed vector shape metadata');
    }
    const restored = createEditorDrawingFabricObject(persisted, 1);
    expect(restored.width).toBeCloseTo(80);
    expect(restored.height).toBeCloseTo(40);
  });

  it('defers text history until the editing lifecycle commits content', () => {
    const text: DrawingObject = {
      id: 'text-1',
      kind: 'text',
      bounds: { x: 10, y: 10, width: 120, height: 40 },
      text: '',
      color: '#111',
      backgroundColor: null,
      fontFamily: 'handwritten',
      fontSize: 24,
    };
    const object = createEditorDrawingFabricObject(text, 1);
    expect(object).toBeInstanceOf(Textbox);
    const commitHistory = vi.fn();
    const surface = canvas();
    createCompletedDrawWorkflowState(
      surface,
      { kind: 'complete', completedTool: 'text', drawSession: null, object },
      commitHistory,
      vi.fn()
    );
    expect(commitHistory).not.toHaveBeenCalled();
    const textbox = object as Textbox;
    expect(textbox.isEditing).toBe(true);
    expect(textbox.selectionStart).toBe(0);
    expect(textbox.selectionEnd).toBe(0);
    textbox.exitEditing();
    surface.dispose();
  });

  it('materializes one exact Fabric path when a live pencil preview commits', () => {
    const initial: DrawingObject = {
      color: '#111111',
      id: 'pencil-1',
      kind: 'pencil',
      samples: [{ t: 0, x: 10, y: 10 }],
      width: 4,
    };
    const final: DrawingObject = {
      ...initial,
      samples: [...initial.samples, { t: 10, x: 30, y: 20 }, { t: 20, x: 60, y: 40 }],
    };
    const object = createEditorDrawingFabricObject(initial, 1);
    object.visible = false;
    stageEditorDrawingObject(object, final);
    const surface = canvas();
    surface.add(object);

    const result = completeEditorDrawWorkflow({
      canvas: surface,
      canvasDocumentSize: { height: 100, width: 200 },
      commitHistory: vi.fn(),
      drawSession: {
        object,
        objectId: final.id,
        pointerId: 7,
        start: new Point(10, 10),
        tool: 'pencil',
      },
      minDrawSize: 8,
      syncRuntimeState: vi.fn(),
    });

    expect(result?.drawSession).toBeNull();
    expect(object.visible).toBe(true);
    expect(parseEditorDrawingMetadata(object.sniptaleDrawingJson)).toEqual(final);
    surface.dispose();
  });

  it.each(['pencil', 'marker'] as const)(
    'retains the accepted %s preview until the scheduled scene render without growing its tail',
    (kind) => {
      const frames = new Map<number, FrameRequestCallback>();
      let frameId = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.set(++frameId, callback);
        return frameId;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
      const surface = new Canvas(document.createElement('canvas'), {
        width: 240,
        height: 100,
        renderOnAddRemove: false,
      });
      try {
        surface.cancelRequestedRender();
        frames.clear();
        const initial = {
          kind,
          id: 'pending-tail',
          samples: [
            { x: 20, y: 40, t: 0 },
            { x: 80, y: 40, t: 10 },
          ],
          color: '#ff0000',
          width: 12,
          opacity: 1,
        };
        const object = createEditorDrawingFabricObject(initial, 1);
        object.visible = false;
        object.objectCaching = false;
        surface.add(object);
        let session: DrawSession | null = {
          tool: kind,
          object,
          objectId: initial.id,
          pointerId: 1,
          start: new Point(20, 40),
          lastPoint: new Point(180, 40),
        };
        const bindings = { getCanvas: () => surface, getDrawSession: () => session };
        surface.on('before:render', createBeforeRenderHandler(bindings));
        surface.on('after:render', createAfterRenderHandler(bindings));
        const alpha = (context: CanvasRenderingContext2D, x: number) => {
          const bytes = context.getImageData(x, 32, 20, 16).data;
          let sum = 0;
          for (let index = 3; index < bytes.length; index += 4) sum += bytes[index]!;
          return sum;
        };
        const flush = () => {
          const callbacks = [...frames.values()];
          frames.clear();
          callbacks.forEach((callback) => callback(0));
        };
        renderEditorFreehandDraft(bindings);
        flush();
        expect(alpha(surface.contextTop, 45)).toBeGreaterThan(0);
        expect(alpha(surface.contextTop, 165)).toBe(0);
        const final = { ...initial, samples: [...initial.samples, { x: 180, y: 40, t: 20 }] };
        stageEditorDrawingObject(object, final);
        renderEditorFreehandDraft(bindings);
        // The accepted tail must be visible before pointerup starts history work.
        expect(alpha(surface.contextTop, 165)).toBeGreaterThan(0);
        const commitHistory = vi.fn(() => {
          expect(parseEditorDrawingMetadata(object.sniptaleDrawingJson)).toEqual(final);
          expect(alpha(surface.getContext(), 165)).toBe(0);
          expect(alpha(surface.contextTop, 165)).toBeGreaterThan(0);
        });
        const completion = completeEditorDrawWorkflow({
          canvas: surface,
          drawSession: session,
          canvasDocumentSize: { width: 240, height: 100 },
          minDrawSize: 8,
          commitHistory,
          syncRuntimeState: vi.fn(),
        });
        session = completion?.drawSession ?? null;
        expect(commitHistory).toHaveBeenCalledOnce();
        expect(completion?.drawSession).toBeNull();
        flush();
        expect(alpha(surface.getContext(), 165)).toBeGreaterThan(0);
        expect(alpha(surface.contextTop, 45)).toBe(0);
        const pixels = surface.getContext().getImageData(0, 0, 240, 100).data;
        flush();
        expect(surface.getContext().getImageData(0, 0, 240, 100).data).toEqual(pixels);
        expect(frames.size).toBe(0);
      } finally {
        surface.destroy();
        vi.restoreAllMocks();
      }
    }
  );

  it.each([
    { kind: 'visible', visible: true },
    { kind: 'hidden non-freehand', visible: false },
  ])('leaves a $kind object outside freehand preview materialization', ({ visible }) => {
    const drawing: DrawingObject = {
      bounds: { height: 20, width: 40, x: 10, y: 10 },
      color: '#111111',
      fillColor: null,
      id: `shape-${visible ? 'visible' : 'hidden'}`,
      kind: 'rectangle',
      width: 4,
    };
    const object = createEditorDrawingFabricObject(drawing, 1);
    object.visible = visible;
    const surface = canvas();
    surface.add(object);

    completeEditorDrawWorkflow({
      canvas: surface,
      canvasDocumentSize: { height: 100, width: 200 },
      commitHistory: vi.fn(),
      drawSession: {
        object,
        objectId: drawing.id,
        pointerId: 7,
        start: new Point(10, 10),
        tool: 'shape',
      },
      minDrawSize: 8,
      syncRuntimeState: vi.fn(),
    });

    expect(object.visible).toBe(visible);
    surface.dispose();
  });
});
