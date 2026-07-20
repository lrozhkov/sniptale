import { describe, expect, it } from 'vitest';

import { SHARED_DESIGN_SYSTEM_POPUP_SHELL_REGISTRY } from './popup-shell.data.ts';

describe('shared popup-shell design-system registry', () => {
  it('registers PopupSelect as the popup selector owner', () => {
    const popupSelectEntry = SHARED_DESIGN_SYSTEM_POPUP_SHELL_REGISTRY.find(
      (entry) => entry.componentId === 'shared.ui.popup-select'
    );

    expect(popupSelectEntry).toEqual(
      expect.objectContaining({
        canonicalImplementation: 'apps/extension/src/ui/popup-shell/select/index.tsx',
        canonicalPreview:
          'apps/extension/src/design-system/previews/popup-shell/select/design-system.tsx',
        previewFidelity: 'canonical',
      })
    );
    expect(popupSelectEntry?.usageContexts.map((context) => context.usageId)).toEqual([
      'popup.video-setup.preset-selector',
      'popup.video-setup.microphone-selector',
    ]);
  });

  it('keeps popup action buttons as the canonical flat CTA reference', () => {
    const popupActionEntry = SHARED_DESIGN_SYSTEM_POPUP_SHELL_REGISTRY.find(
      (entry) => entry.componentId === 'shared.ui.popup-action-button'
    );
    const popupFooterActionEntry = SHARED_DESIGN_SYSTEM_POPUP_SHELL_REGISTRY.find(
      (entry) => entry.componentId === 'shared.ui.popup-footer-action'
    );

    expect(popupActionEntry).toEqual(
      expect.objectContaining({
        canonicalImplementation: 'apps/extension/src/ui/popup-shell/action-button/index.tsx',
        canonicalPreview:
          'apps/extension/src/design-system/previews/popup-shell/action-button/design-system.tsx',
      })
    );
    expect(popupActionEntry?.descriptionEn).toContain('flat popup CTA surface');
    expect(popupActionEntry?.variants[0]?.descriptionEn).toContain(
      'no permanent accent-tinted fill'
    );
    expect(popupFooterActionEntry?.descriptionEn).toContain('borderless matte utility action');
    expect(popupFooterActionEntry?.variants[0]?.technicalNotesEn.join(' ')).toContain(
      'borderless matte idle state'
    );
  });
});
