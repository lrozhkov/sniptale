import { describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_RASTER_TOOL_SETTINGS } from './raster-tools';

describe('editor store raster tool settings', () => {
  it('provides brush defaults without changing existing raster tool defaults', () => {
    expect(DEFAULT_EDITOR_RASTER_TOOL_SETTINGS).toMatchObject({
      brushColor: '#ea580c',
      brushHardness: 0.85,
      brushOpacity: 1,
      brushSize: 24,
      eraserSize: 28,
      fillMode: 'bucket',
      selectionMode: 'marquee',
    });
  });
});
