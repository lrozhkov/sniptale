import { describe, expect, it } from 'vitest';
import { DEFAULT_RICH_SHAPE_STYLE } from '../../../../features/editor/document/rich-shape';
import { createDefaultRichShapeStyle } from './defaults';

describe('rich shape default style owner', () => {
  it('returns a mutable copy of nested default style fields', () => {
    const style = createDefaultRichShapeStyle();

    expect(style).toEqual(DEFAULT_RICH_SHAPE_STYLE);
    expect(style.fill).not.toBe(DEFAULT_RICH_SHAPE_STYLE.fill);
    expect(style.line).not.toBe(DEFAULT_RICH_SHAPE_STYLE.line);
  });
});
