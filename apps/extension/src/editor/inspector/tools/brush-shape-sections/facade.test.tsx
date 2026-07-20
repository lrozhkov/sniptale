import { describe, expect, it } from 'vitest';

import * as brushShapeSections from '.';

describe('editor inspector tool brush/shape sections', () => {
  it('exports the canonical brush and shape renderers', () => {
    expect(brushShapeSections.renderBrushControlsSection).toBeTypeOf('function');
    expect(brushShapeSections.renderShapeControlsSection).toBeTypeOf('function');
  });
});
