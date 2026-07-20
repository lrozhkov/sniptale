import { describe, expect, it } from 'vitest';
import {
  renderBlurControlsSection,
  renderBrushControlsSection,
  renderShapeControlsSection,
} from './controls';

describe('editor-inspector-tools-control-sections', () => {
  it('re-exports the brush, blur, and shape renderers', () => {
    expect(renderBrushControlsSection).toBeTypeOf('function');
    expect(renderBlurControlsSection).toBeTypeOf('function');
    expect(renderShapeControlsSection).toBeTypeOf('function');
  });
});
