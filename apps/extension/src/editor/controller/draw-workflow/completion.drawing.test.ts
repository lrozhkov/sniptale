// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { Canvas, Textbox } from 'fabric';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import type { DrawingObject } from '../../../features/drawing/public';
import { createCompletedDrawWorkflowState } from './completion-complete';

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
    createCompletedDrawWorkflowState(
      canvas(),
      { kind: 'complete', completedTool: 'text', drawSession: null, object },
      commitHistory,
      vi.fn()
    );
    expect(commitHistory).not.toHaveBeenCalled();
  });
});
