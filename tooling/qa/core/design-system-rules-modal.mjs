import path from 'node:path';

export function getModalBypassRules(sharedUiRoot) {
  return [
    {
      familyId: 'product.ui.modal-shell',
      classPatterns: [
        /className\s*=\s*['"`][^'"`]*(?<![\w-])sniptale-modal-backdrop(?=\s|['"`])/,
        /className\s*=\s*['"`][^'"`]*(?<![\w-])sniptale-modal(?=\s|['"`])/,
        /className\s*=\s*['"`][^'"`]*(?<![\w-])sniptale-modal-accent(?=\s|['"`])/,
        /className\s*=\s*['"`][^'"`]*(?<![\w-])sniptale-modal-header(?=\s|['"`])/,
        /className\s*=\s*['"`][^'"`]*(?<![\w-])sniptale-modal-close(?=\s|['"`])/,
        /className\s*=\s*['"`][^'"`]*(?<![\w-])sniptale-modal-body(?=\s|['"`])/,
        /className\s*=\s*['"`][^'"`]*(?<![\w-])sniptale-modal-footer(?=\s|['"`])/,
      ],
      allowlist: new Set([
        path.join(sharedUiRoot, 'ProductModal.tsx'),
        path.join(sharedUiRoot, 'ProductModal.design-system.tsx'),
        path.join(sharedUiRoot, 'ProductSaveDialog.tsx'),
        path.join(sharedUiRoot, 'ProductSaveDialog.design-system.tsx'),
      ]),
    },
    {
      familyId: 'product.ui.form-controls',
      classPatterns: [
        /className\s*=\s*['"`][^'"`]*sniptale-input\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-textarea\b/,
      ],
      allowlist: new Set([
        path.join(sharedUiRoot, 'ProductFormControls.tsx'),
        path.join(sharedUiRoot, 'ProductModal.design-system.tsx'),
        path.join(sharedUiRoot, 'ProductSaveDialog.tsx'),
        path.join(sharedUiRoot, 'ProductSaveDialog.design-system.tsx'),
      ]),
    },
    {
      familyId: 'product.ui.modal-actions',
      classPatterns: [
        /className\s*=\s*['"`][^'"`]*sniptale-btn-primary\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-btn-secondary\b/,
      ],
      allowlist: new Set([path.join(sharedUiRoot, 'ProductModalActions.tsx')]),
    },
  ];
}
