import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const designSystemPreviewLayoutStylesheet = readFileSync(
  new URL('./layout.css', import.meta.url),
  'utf8'
);

describe('design-system preview layout contract', () => {
  it('keeps modal backdrops and floating tooltips sandboxed inside the preview frame', () => {
    expect(designSystemPreviewLayoutStylesheet).toContain(
      "[data-ui='design-system.preview-frame'] .sniptale-modal-backdrop {"
    );
    expect(designSystemPreviewLayoutStylesheet).toContain(
      "[data-ui='design-system.preview-frame'] .sniptale-content-size-tooltip {"
    );
    expect(designSystemPreviewLayoutStylesheet).toContain('position: absolute !important;');
    expect(designSystemPreviewLayoutStylesheet).toContain('z-index: 1 !important;');
  });
});
