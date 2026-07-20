import { describe, expect, it } from 'vitest';
import { cx, getDiagnosticsToggleTitle } from './helpers';

describe('workspace sidebar libraries shared helpers', () => {
  it('joins only truthy class names', () => {
    expect(cx('a', false, 'b', null, undefined)).toBe('a b');
  });

  it('resolves diagnostics toggle title for both states', () => {
    expect(getDiagnosticsToggleTitle(true)).toBeTruthy();
    expect(getDiagnosticsToggleTitle(false)).toBeTruthy();
  });
});
