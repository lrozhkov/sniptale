import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const foundationStylesheet = readFileSync(new URL('./foundation.css', import.meta.url), 'utf8');

describe('styles.foundation contract', () => {
  it('keeps extension surfaces non-selectable while preserving editable descendants', () => {
    expect(foundationStylesheet).toContain('.sniptale-extension-surface,');
    expect(foundationStylesheet).toContain('.sniptale-extension-surface * {');
    expect(foundationStylesheet).toContain('user-select: none;');
    expect(foundationStylesheet).toContain('-webkit-user-select: none;');
    expect(foundationStylesheet).toContain(
      '.sniptale-extension-surface :is(input, textarea, select, [contenteditable]),'
    );
    expect(foundationStylesheet).toContain('.sniptale-extension-surface [contenteditable] * {');
    expect(foundationStylesheet).toContain('user-select: text;');
  });

  it('keeps native cursors across extension-owned surfaces', () => {
    expect(foundationStylesheet).toMatch(/\.sniptale-extension-surface\s*{\s*cursor:\s*default;/);
    expect(foundationStylesheet).toContain("[role='menuitem']:not([aria-disabled='true'])");
    expect(foundationStylesheet).toContain('a[href]');
    expect(foundationStylesheet).toContain('cursor: pointer;');
    expect(foundationStylesheet).toContain('cursor: auto;');
  });
});
