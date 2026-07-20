import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const overlaysStylesheet = readFileSync(new URL('./root.css', import.meta.url), 'utf8');
const overlaysOwnerStylesheet = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('overlays aggregator contract', () => {
  it('stays a thin import-only facade over the canonical overlay owners', () => {
    expect(overlaysStylesheet.trim()).toBe("@import './index.css';");
  });

  it('keeps the canonical overlays owner as the import-only aggregator', () => {
    expect(overlaysOwnerStylesheet.trim()).toBe(
      [
        "@import './modal-shell.css';",
        "@import './menu-surfaces.css';",
        "@import './save-dialog.css';",
        "@import './countdown.css';",
        "@import './ai-modal-overrides/root.css';",
      ].join('\n')
    );
  });
});
