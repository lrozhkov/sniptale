import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const overlaysSaveDialogStylesheet = readFileSync(
  new URL('./save-dialog.css', import.meta.url),
  'utf8'
);

describe('overlays.save-dialog contract', () => {
  it('keeps save dialog sections on the softer matte panel contract', () => {
    expect(overlaysSaveDialogStylesheet).toContain('.sniptale-save-dialog-section {');
    expect(overlaysSaveDialogStylesheet).toContain('display: flex;');
    expect(overlaysSaveDialogStylesheet).toContain('padding: 14px;');
    expect(overlaysSaveDialogStylesheet).toContain(
      'background: color-mix(in srgb, var(--sniptale-color-surface-hover) 42%, transparent);'
    );
  });

  it('owns save dialog accent badges without reintroducing ai icon badge styling', () => {
    expect(overlaysSaveDialogStylesheet).toContain('.sniptale-save-dialog-icon-badge {');
    expect(overlaysSaveDialogStylesheet).toContain(
      'background: color-mix(in srgb, var(--sniptale-color-accent) 6%, transparent);'
    );
    expect(overlaysSaveDialogStylesheet).not.toContain('.sniptale-ai-icon-badge');
  });
});
