import { describe, expect, it } from 'vitest';

import { actionFooterSurfaceClassName, actionFooterThreeColumnGridClassName } from './tokens';

describe('popup action footer tokens', () => {
  it('keeps footer actions unframed and preserves the active-action grid', () => {
    expect(actionFooterSurfaceClassName).toBe('pt-2');
    expect(actionFooterSurfaceClassName).not.toContain('border');
    expect(actionFooterSurfaceClassName).not.toContain('bg-');
    expect(actionFooterThreeColumnGridClassName).toBe(
      'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_48px] gap-1.5'
    );
  });
});
