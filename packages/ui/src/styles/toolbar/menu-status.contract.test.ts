import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarMenuStatusStylesheet = readFileSync(
  new URL('./menu-status.css', import.meta.url),
  'utf8'
);

describe('toolbar-menu-status contract', () => {
  it('keeps timer and viewport status badge styling on the status owner', () => {
    expect(toolbarMenuStatusStylesheet).toContain('.sniptale-timer-badge,');
    expect(toolbarMenuStatusStylesheet).toContain('.sniptale-viewport-badge {');
  });

  it('does not keep transient wrappers or countdown ownership inline', () => {
    expect(toolbarMenuStatusStylesheet).not.toContain('.sniptale-timer-wrapper');
    expect(toolbarMenuStatusStylesheet).not.toContain('.sniptale-countdown-toast');
  });
});
