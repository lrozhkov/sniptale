import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const aiModalStylesheet = readFileSync(new URL('./root.css', import.meta.url), 'utf8');

describe('ai-modal contract', () => {
  it('stays a thin import-only facade over the canonical ai-modal owners', () => {
    expect(aiModalStylesheet.trim()).toBe("@import './index.css';");
  });
});
