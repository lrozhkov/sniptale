import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarStylesheet = readFileSync(new URL('./root.css', import.meta.url), 'utf8');
const toolbarOwnerStylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('toolbar aggregator contract', () => {
  it('keeps the root stylesheet as a thin import-only facade', () => {
    expect(toolbarStylesheet.trim()).toBe("@import './index.css';");
  });

  it('keeps the canonical toolbar owner as the import-only aggregator', () => {
    expect(toolbarOwnerStylesheet.trim()).toBe(
      [
        "@import './shell.css';",
        "@import './menu-surface.css';",
        "@import './menu-items.css';",
        "@import './menu-status.css';",
      ].join('\n')
    );
  });

  it('stays a thin import-only facade over the canonical toolbar owners', () => {
    expect(toolbarStylesheet.trim()).toBe("@import './index.css';");
  });
});
