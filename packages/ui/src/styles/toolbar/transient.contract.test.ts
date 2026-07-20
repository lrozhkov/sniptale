import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarTransientStylesheet = readFileSync(
  new URL('./transient/root.css', import.meta.url),
  'utf8'
);

describe('toolbar-transient aggregator contract', () => {
  it('stays a thin import-only facade over actions, feedback, and menu variants', () => {
    expect(toolbarTransientStylesheet.trim()).toBe(
      ["@import './actions.css';", "@import './feedback.css';", "@import './menus.css';"].join('\n')
    );
  });
});
