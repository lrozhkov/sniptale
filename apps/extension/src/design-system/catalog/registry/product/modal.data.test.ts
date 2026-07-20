import { describe, expect, it } from 'vitest';

import { PRODUCT_DESIGN_SYSTEM_MODAL_REGISTRY } from './modal.data.ts';

describe('product modal design-system registry', () => {
  it('keeps modal shell and modal actions on the matte-neutral shared contract', () => {
    const modalShellEntry = PRODUCT_DESIGN_SYSTEM_MODAL_REGISTRY.find(
      (entry) => entry.componentId === 'product.ui.modal-shell'
    );
    const modalActionsEntry = PRODUCT_DESIGN_SYSTEM_MODAL_REGISTRY.find(
      (entry) => entry.componentId === 'product.ui.modal-actions'
    );

    expect(modalShellEntry?.descriptionEn).toContain('matte-neutral modal surface');
    expect(modalShellEntry?.variants[0]?.technicalNotesEn).toContain(
      'Idle chrome stays matte-neutral across both themes.'
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
