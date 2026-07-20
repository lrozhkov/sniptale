import { describe, expect, it } from 'vitest';

import {
  footerActionGridClassName,
  footerCopyButtonBaseClassName,
  footerCopyButtonDisabledClassName,
  footerCopyButtonEnabledClassName,
  footerPrimaryIdleButtonIconClassName,
  footerPrimaryButtonIconClassName,
  footerSurfaceClassName,
} from './tokens';

describe('footer.tokens', () => {
  it('keeps the footer shell and button tokens in one place', () => {
    expect(footerSurfaceClassName).toContain('rounded-[16px]');
    expect(footerActionGridClassName).toContain('grid-cols-[minmax(0,1fr)_48px_48px_48px]');
    expect(footerCopyButtonBaseClassName).toContain('h-12');
    expect(footerCopyButtonBaseClassName).toContain('w-12');
    expect(footerCopyButtonEnabledClassName).toContain('bg-transparent');
    expect(footerCopyButtonDisabledClassName).toContain('cursor-not-allowed');
    expect(footerPrimaryButtonIconClassName).toContain('text-[var(--sniptale-color-text-primary)]');
    expect(footerPrimaryIdleButtonIconClassName).toContain(
      'group-hover:text-[var(--sniptale-color-accent-emphasis)]'
    );
  });
});
