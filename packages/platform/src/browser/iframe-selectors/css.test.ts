import { afterEach, expect, it, vi } from 'vitest';

import { escapeCssIdentifier } from './css';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('uses CSS.escape when the browser API is available', () => {
  const escape = vi.fn((value: string) => `escaped:${value}`);
  vi.stubGlobal('CSS', { escape });

  expect(escapeCssIdentifier('dialog:primary')).toBe('escaped:dialog:primary');
  expect(escape).toHaveBeenCalledWith('dialog:primary');
});

it('falls back to manual escaping when CSS.escape is unavailable', () => {
  vi.stubGlobal('CSS', undefined);

  expect(escapeCssIdentifier('dialog:primary button')).toBe('dialog\\:primary\\ button');
});
