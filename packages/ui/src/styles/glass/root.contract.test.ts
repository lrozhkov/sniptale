import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const glassStylesheet = readFileSync(new URL('./root.css', import.meta.url), 'utf8');
const glassOwnerStylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('glass aggregator contract', () => {
  it('stays a thin import-only facade over the canonical glass owners', () => {
    expect(glassStylesheet.trim()).toBe("@import './index.css';");
  });

  it('keeps the canonical glass owner as the import-only aggregator', () => {
    expect(glassOwnerStylesheet.trim()).toBe(
      [
        "@import './expired-overlay.css';",
        "@import './popover-foundation.css';",
        "@import './popover-controls.css';",
        "@import './toolbar-form-layout.css';",
        "@import './input-controls.css';",
        "@import './color-controls.css';",
        "@import './step-badge.css';",
        "@import '../content-popover/index.css';",
      ].join('\n')
    );
  });
});
