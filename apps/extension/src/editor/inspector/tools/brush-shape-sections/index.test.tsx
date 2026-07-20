import { describe, expect, it } from 'vitest';
import { renderBrushControlsSection, renderShapeControlsSection } from './';

describe('brush-shape sections index', () => {
  it('re-exports the brush and shape section renderers', () => {
    expect(renderBrushControlsSection).toBeTypeOf('function');
    expect(renderShapeControlsSection).toBeTypeOf('function');
  });
});
