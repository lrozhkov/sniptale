import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const aiModalHeaderStylesheet = readFileSync(new URL('./header.css', import.meta.url), 'utf8');

describe('ai-modal header contract', () => {
  it('keeps ai icon and header copy roles on the header owner', () => {
    expect(aiModalHeaderStylesheet).toContain('.sniptale-ai-icon-badge {');
    expect(aiModalHeaderStylesheet).toContain('.sniptale-ai-modal-header-content {');
    expect(aiModalHeaderStylesheet).toContain('.sniptale-ai-modal-header-icon {');
    expect(aiModalHeaderStylesheet).toContain('.sniptale-ai-modal-context-info {');
    expect(aiModalHeaderStylesheet).toContain('.sniptale-ai-modal-kbd-hint {');
  });
});
