import { describe, expect, it } from 'vitest';

import { buildDesignSystemVariantPreviewMap } from '.';

describe('design-system preview map', () => {
  it('includes the canonical PopupSelect preview', () => {
    const previewMap = buildDesignSystemVariantPreviewMap('ru');

    expect(previewMap.has('shared.ui.popup-select.default')).toBe(true);
  });
});
