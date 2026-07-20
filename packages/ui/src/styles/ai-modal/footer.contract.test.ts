import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const aiModalFooterStylesheet = readFileSync(new URL('./footer.css', import.meta.url), 'utf8');

describe('ai-modal footer contract', () => {
  it('keeps footer metadata and selector roles on the footer owner', () => {
    expect(aiModalFooterStylesheet).toContain('.sniptale-ai-modal-footer-meta {');
    expect(aiModalFooterStylesheet).toContain('.sniptale-ai-modal-footer-actions {');
    expect(aiModalFooterStylesheet).toContain('.sniptale-ai-modal-submit-tip {');
    expect(aiModalFooterStylesheet).toContain('.sniptale-ai-modal-submit-tip-anchor:hover');
    expect(aiModalFooterStylesheet).toContain('.sniptale-ai-modal-token-text,');
    expect(aiModalFooterStylesheet).toContain('.sniptale-ai-model-selector-trigger {');
    expect(aiModalFooterStylesheet).toContain('.sniptale-ai-model-selector-section-label {');
  });
});
