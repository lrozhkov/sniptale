import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

const previewDataStylesheet = readFileSync(new URL('./preview-data.css', import.meta.url), 'utf8');

it('uses the canonical navigation accent for checked boxes', () => {
  expect(previewDataStylesheet).toContain(
    '.sniptale-checkbox:checked {\n  background: var(--sniptale-color-accent);\n  border-color: var(--sniptale-color-accent);'
  );
  expect(previewDataStylesheet).toContain('border: solid var(--sniptale-color-text-inverse);');
  expect(previewDataStylesheet).not.toContain('var(--sniptale-accent) 14%');
});
