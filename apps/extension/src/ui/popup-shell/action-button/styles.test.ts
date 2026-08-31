import { describe, expect, it } from 'vitest';

import { getPopupActionButtonRootClassName } from './styles';

describe('popup-action-button.styles', () => {
  it('keeps popup action buttons transparent at rest across primary and gallery tones', () => {
    const primaryClassName = getPopupActionButtonRootClassName('primary', false);
    const galleryClassName = getPopupActionButtonRootClassName('gallery', false);

    expect(primaryClassName).toContain('border-none');
    expect(primaryClassName).toContain('bg-transparent');
    expect(primaryClassName).toContain('var(--sniptale-color-text-primary-strong)');
    expect(primaryClassName).toContain('var(--sniptale-color-accent-emphasis)');
    expect(primaryClassName).toContain('hover:bg-[');
    expect(galleryClassName).toContain('border-none');
    expect(galleryClassName).toContain('bg-transparent');
    expect(galleryClassName).toContain('var(--sniptale-color-text-primary)');
    expect(galleryClassName).toContain('hover:bg-[');
  });

  it('keeps disabled buttons on the quiet neutral contract', () => {
    const disabledClassName = getPopupActionButtonRootClassName('primary', true);

    expect(disabledClassName).toContain('cursor-not-allowed');
    expect(disabledClassName).toContain('border-none');
    expect(disabledClassName).not.toContain('bg-transparent');
  });

  it('uses destructive emphasis only when a danger action is hovered or focused', () => {
    const dangerClassName = getPopupActionButtonRootClassName('danger', false);

    expect(dangerClassName).toContain('bg-transparent');
    expect(dangerClassName).toContain('hover:text-[var(--sniptale-color-danger)]');
    expect(dangerClassName).toContain('focus-visible:text-[var(--sniptale-color-danger)]');
  });
});
