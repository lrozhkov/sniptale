// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Canvas, Textbox } from 'fabric';
import {
  createEditorDrawingFabricObject,
  updateEditorDrawingShapeDraft,
} from '../../drawing/object/vector';
import type { DrawingObject } from '../../../features/drawing/public';
import { createCompletedDrawWorkflowState } from './completion-complete';
import { parseEditorDrawingMetadata } from '../../document/import-boundary';

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
    expect(object.borderDashArray).toEqual([4, 3]);
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
});
