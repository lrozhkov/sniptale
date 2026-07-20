import { describe, expect, it } from 'vitest';
import {
  EDITOR_CANVAS_CONTEXT_MENU_DATA_UI,
  EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI,
  EDITOR_CANVAS_CONTEXT_ZONE_DATA_UI,
  EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI,
  EDITOR_CANVAS_VIEWPORT_DATA_UI,
  snapshotCanvasContextMenuLayer,
} from './types';

describe('canvas context-menu types', () => {
  it('exports canonical data-ui owners for the page and canvas seams', () => {
    expect(EDITOR_CANVAS_CONTEXT_ZONE_DATA_UI).toBe('editor.canvas.context-zone');
    expect(EDITOR_CANVAS_CONTEXT_MENU_DATA_UI).toBe('editor.canvas.context-menu');
    expect(EDITOR_CANVAS_CONTEXT_SURFACE_DATA_UI).toBe('editor.canvas.surface-hit-area');
    expect(EDITOR_CANVAS_VIEWPORT_DATA_UI).toBe('editor.canvas.viewport');
    expect(EDITOR_CANVAS_EMPTY_DROPZONE_DATA_UI).toBe('editor.canvas.empty-dropzone');
  });

  it('returns null for a missing layer snapshot', () => {
    expect(snapshotCanvasContextMenuLayer(null)).toBeNull();
  });

  it('normalizes layer booleans into a disposable snapshot', () => {
    expect(
      snapshotCanvasContextMenuLayer({
        effectCount: 0,
        effects: [],
        id: 'layer-1',
        immutable: false,
        locked: true,
        name: 'Layer 1',
        previewColor: '#ff5500',
        previewDataUrl: null,
        previewTransparent: false,
        raster: false,
        selected: false,
        selectedCount: 0,
        type: 'rectangle',
        typeLabel: 'Rectangle',
        visible: false,
      })
    ).toEqual({
      id: 'layer-1',
      immutable: false,
      locked: true,
      visible: false,
    });
  });
});
