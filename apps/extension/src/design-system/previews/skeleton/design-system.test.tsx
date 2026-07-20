import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { buildSkeletonSharedPreviews } from './design-system';

describe('skeleton design-system previews', () => {
  it('builds the exact line and card variants as renderable previews', () => {
    const previews = buildSkeletonSharedPreviews('en');

    expect(previews.map((preview) => preview.previewId)).toEqual([
      'shared.ui.skeleton.lines',
      'shared.ui.skeleton.card',
    ]);
    expect(previews.every((preview) => isValidElement(preview.preview))).toBe(true);
    expect(previews).not.toHaveLength(0);
  });
});
