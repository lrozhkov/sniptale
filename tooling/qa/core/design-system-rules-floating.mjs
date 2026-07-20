import path from 'node:path';

function createFloatingRule(familyId, classPatterns, allowlist) {
  return {
    familyId,
    classPatterns,
    allowlist,
  };
}

function createAllowlist(sharedUiRoot, ...fileNames) {
  return new Set(fileNames.map((fileName) => path.join(sharedUiRoot, fileName)));
}

const FLOATING_RULE_DEFINITIONS = [
  {
    familyId: 'product.ui.dropdown-menu',
    classPatterns: [
      /className\s*=\s*['"`][^'"`]*\bsniptale-dropdown-menu\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-dropdown-item\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-dropdown-divider\b/,
    ],
    fileNames: ['ProductDropdownMenu.tsx', 'ProductDropdownMenu.design-system.tsx'],
  },
  {
    familyId: 'product.ui.toolbar-menu',
    classPatterns: [
      /className\s*=\s*['"`][^'"`]*\bsniptale-popover-menu\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-popover-item\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-popover-divider\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toolbar-menu-item\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toolbar-menu-title\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toolbar-menu-list\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toolbar-menu-item-copy\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toolbar-menu-item-label\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toolbar-menu-item-hint\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toolbar-menu-item-badge\b/,
    ],
    fileNames: ['ProductToolbarMenu.tsx', 'ProductToolbarMenu.design-system.tsx'],
  },
  {
    familyId: 'product.ui.confirm-dialog',
    classPatterns: [
      /className\s*=\s*['"`][^'"`]*\bsniptale-confirm-dialog\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-confirm-title\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-confirm-message\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-confirm-actions\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-confirm-cancel\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-confirm-danger\b/,
    ],
    fileNames: ['ProductConfirmDialog.tsx', 'ProductConfirmDialog.design-system.tsx'],
  },
  {
    familyId: 'product.ui.toast',
    classPatterns: [
      /className\s*=\s*['"`][^'"`]*\bsniptale-toast-icon\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toast-icon-wrapper\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-toast-message\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-toast-container\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-toast\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-main\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-icon\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-copy\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-label\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-number\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-suffix\b/,
      /className\s*=\s*['"`][^'"`]*\bsniptale-countdown-cancel\b/,
    ],
    fileNames: ['ProductToast.tsx', 'ProductToast.design-system.tsx'],
  },
];

export function getFloatingSurfaceBypassRules(sharedUiRoot) {
  return FLOATING_RULE_DEFINITIONS.map(({ familyId, classPatterns, fileNames }) =>
    createFloatingRule(familyId, classPatterns, createAllowlist(sharedUiRoot, ...fileNames))
  );
}
