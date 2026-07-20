// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderPreviewHarness, THEME_SCOPED_PREVIEW_CASES } from './fixtures';

describe('design-system parity fixtures', () => {
  it('keeps range previews in the theme-scoped parity matrix', () => {
    expect(THEME_SCOPED_PREVIEW_CASES).toEqual(
      expect.arrayContaining([
        { previewKey: 'product.ui.form-controls.range', selector: '.sniptale-range' },
        { previewKey: 'product.ui.glass-controls.range', selector: '.sniptale-glass-range' },
        { previewKey: 'shared.ui.compact-inspector-controls.range', selector: '.sniptale-range' },
      ])
    );
  });

  it('rejects missing preview keys before mounting a preview harness', async () => {
    await expect(renderPreviewHarness('missing.preview')).rejects.toThrow(
      'missing.preview should exist'
    );
  });
});
