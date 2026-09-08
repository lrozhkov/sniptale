import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('./feedback.css', import.meta.url), 'utf8');

it('leaves confirmation spacing to its modal header, body and footer', () => {
  const shell = css.match(/\.sniptale-confirm-dialog\s*\{([^}]+)\}/)?.[1];
  const message = css.match(/\.sniptale-confirm-message\s*\{([^}]+)\}/)?.[1];
  expect(shell).toBeDefined();
  expect(shell).not.toMatch(/padding\s*:/);
  expect(message).toMatch(/margin:\s*0;/);
});
