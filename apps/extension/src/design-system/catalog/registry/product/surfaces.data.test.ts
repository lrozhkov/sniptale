import { describe, expect, it } from 'vitest';

import { PRODUCT_DESIGN_SYSTEM_SURFACES_REGISTRY } from './surfaces.data.ts';

describe('product surface design-system registry', () => {
  it('keeps menu surfaces on the flat matte-neutral overlay contract', () => {
    const dropdownEntry = PRODUCT_DESIGN_SYSTEM_SURFACES_REGISTRY.find(
      (entry) => entry.componentId === 'product.ui.dropdown-menu'
    );
    const toolbarEntry = PRODUCT_DESIGN_SYSTEM_SURFACES_REGISTRY.find(
      (entry) => entry.componentId === 'product.ui.toolbar-menu'
    );

    expect(dropdownEntry?.descriptionEn).toContain('matte-neutral dropdown/menu pattern');
    expect(dropdownEntry?.variants[0]?.technicalNotesEn).toContain(
      'Idle rows stay flat, with the surface appearing on hover and selected state.'
    );
    expect(toolbarEntry?.descriptionEn).toContain('Matte-neutral floating toolbar menu');
    expect(toolbarEntry?.variants[2]?.technicalNotesEn.join(' ')).toContain(
      'selected border instead of an accent wash'
    );
  });
});
