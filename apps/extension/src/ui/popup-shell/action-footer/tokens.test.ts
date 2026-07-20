import { describe, expect, it } from 'vitest';

import { actionFooterSurfaceClassName, actionFooterThreeColumnGridClassName } from './tokens';

describe('popup action footer tokens', () => {
  it('keeps the shared footer surface and active-action grid contracts stable', () => {
    expect(actionFooterSurfaceClassName).toContain('rounded-[16px]');
    expect(actionFooterSurfaceClassName).toContain('border');
    expect(actionFooterSurfaceClassName).toContain('bg-[color:color-mix');
    expect(actionFooterThreeColumnGridClassName).toBe(
      'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_48px] gap-1.5'
    );
  });
});
