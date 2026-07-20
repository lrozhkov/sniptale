import { describe, expect, it, vi } from 'vitest';
import {
  clearActiveAnnotationSelection,
  isStickyAnnotationTool,
  isTargetInCurrentSelection,
} from './drawing.helpers';

function registerStickyToolTest() {
  it('treats raster tools as non-sticky annotation tools', () => {
    const stickyTools = [
      'pencil',
      'highlighter',
      'shapes-and-lines',
      'rough-shape',
      'shape-library',
      'rectangle',
      'ellipse',
      'diamond',
      'blur',
      'arrow',
      'line',
      'callout',
      'text',
      'step',
    ] as const;
    const nonStickyTools = [
      'selection',
      'brush',
      'eraser',
      'fill',
      'select',
      'image',
      'crop',
    ] as const;

    stickyTools.forEach((tool) => expect(isStickyAnnotationTool(tool)).toBe(true));
    nonStickyTools.forEach((tool) => expect(isStickyAnnotationTool(tool)).toBe(false));
  });
}

function registerSelectionMembershipTest() {
  it('matches selection membership by object identity and sniptaleId', () => {
    const selected = { sniptaleId: 'layer-1' };
    const canvas = {
      getActiveObject: () => selected,
      getActiveObjects: () => [{ sniptaleId: 'layer-2' }],
    };

    expect(isTargetInCurrentSelection(canvas as never, selected as never)).toBe(true);
    expect(isTargetInCurrentSelection(canvas as never, { sniptaleId: 'layer-2' } as never)).toBe(
      true
    );
    expect(isTargetInCurrentSelection(canvas as never, { sniptaleId: 'layer-9' } as never)).toBe(
      false
    );
    expect(isTargetInCurrentSelection(canvas as never, null)).toBe(false);
  });
}

function registerClearSelectionTest() {
  it('clears active annotation selection and exits text editing when needed', () => {
    const exitEditing = vi.fn();
    const canvas = {
      discardActiveObject: vi.fn(),
      getActiveObject: () => ({ exitEditing, isEditing: true }),
      getActiveObjects: () => [{ sniptaleId: 'layer-1' }],
      requestRenderAll: vi.fn(),
    };
    const syncRuntimeState = vi.fn();

    clearActiveAnnotationSelection(canvas as never, syncRuntimeState);

    expect(exitEditing).toHaveBeenCalledOnce();
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerEmptySelectionTest() {
  it('leaves empty annotation selection unchanged', () => {
    const canvas = {
      discardActiveObject: vi.fn(),
      getActiveObject: () => null,
      getActiveObjects: () => [],
      requestRenderAll: vi.fn(),
    };
    const syncRuntimeState = vi.fn();

    clearActiveAnnotationSelection(canvas as never, syncRuntimeState);

    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(syncRuntimeState).not.toHaveBeenCalled();
  });
}

describe('editor-controller/events/drawing.helpers', () => {
  registerStickyToolTest();
  registerSelectionMembershipTest();
  registerClearSelectionTest();
  registerEmptySelectionTest();
});
