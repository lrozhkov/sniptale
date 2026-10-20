import { describe, expect, it } from 'vitest';

import {
  footerActionGridClassName,
  footerPrimaryIdleButtonIconClassName,
  footerPrimaryButtonIconClassName,
  footerSurfaceClassName,
} from './tokens';

describe('footer.tokens', () => {
  it('keeps the footer shell and button tokens in one place', () => {
    expect(footerSurfaceClassName).toContain('pt-2');
    expect(footerSurfaceClassName).not.toContain('border');
    expect(footerActionGridClassName(false, false)).toContain('grid-cols-1');
    expect(footerActionGridClassName(true, true)).toContain('minmax(88px,0.7fr)');
    expect(footerActionGridClassName(false, false, true)).toContain('grid-cols-1');
    expect(footerPrimaryButtonIconClassName).toContain('text-[var(--sniptale-color-text-primary)]');
    expect(footerPrimaryIdleButtonIconClassName).not.toContain('color-accent');
  });
});
