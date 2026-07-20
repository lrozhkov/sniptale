import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const aiModalContentOwnerStylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('ai-modal-content contract', () => {
  it('keeps the canonical ai-modal-content owner as the import-only aggregator', () => {
    expect(aiModalContentOwnerStylesheet.trim()).toBe(
      [
        "@import './base.css';",
        "@import './preview-tree.css';",
        "@import './template-menu.css';",
      ].join('\n')
    );
  });
});
