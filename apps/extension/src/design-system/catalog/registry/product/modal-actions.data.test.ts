import { describe, expect, it } from 'vitest';

import { PRODUCT_DESIGN_SYSTEM_MODAL_ACTIONS_REGISTRY } from './modal-actions.data.ts';

describe('product modal-actions design-system registry', () => {
  it('keeps modal actions on the borderless matte CTA contract', () => {
    const modalActionsEntry = PRODUCT_DESIGN_SYSTEM_MODAL_ACTIONS_REGISTRY.find(
      (entry) => entry.componentId === 'product.ui.modal-actions'
    );

    expect(modalActionsEntry?.descriptionEn).toContain('Borderless button roles');
    expect(modalActionsEntry?.variants[0]?.technicalNotesEn.join(' ')).toContain(
      'does not reduce height or type scale'
    );
    expect(modalActionsEntry?.variants[2]?.technicalNotesEn.join(' ')).toContain(
      'selected border instead of an accent wash'
    );
  });
});
