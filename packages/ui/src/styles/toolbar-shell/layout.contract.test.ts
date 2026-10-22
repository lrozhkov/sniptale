import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const toolbarShellLayoutStylesheet = readFileSync(new URL('./layout.css', import.meta.url), 'utf8');

describe('toolbar-shell layout contract', () => {
  it('fades only opted-in recording chrome and restores interaction visibility', () => {
    expect(toolbarShellLayoutStylesheet).toContain("[data-recording-fade='true']");
    expect(toolbarShellLayoutStylesheet).toContain('opacity: 0.2;');
    expect(toolbarShellLayoutStylesheet).toContain(
      'transition: opacity var(--sniptale-duration-normal) ease-out;'
    );
    expect(toolbarShellLayoutStylesheet).toContain(':focus-within');
    expect(toolbarShellLayoutStylesheet).toContain(":has([aria-expanded='true'])");
    expect(toolbarShellLayoutStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });
  it('keeps toolbar chrome and shell layout on the layout owner', () => {
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-drag-handle {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-group {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-toolbar-subgroup {');
    expect(toolbarShellLayoutStylesheet).toContain('.sniptale-spacer {');
  });
});
