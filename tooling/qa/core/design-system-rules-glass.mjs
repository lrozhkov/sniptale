import path from 'node:path';

export function getGlassBypassRules(srcRoot, sharedUiRoot) {
  return [
    {
      familyId: 'product.ui.glass-toolbar',
      classPatterns: [
        /className\s*=\s*['"`][^'"`]*sniptale-glass-toolbar\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-toolbar-button\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-toolbar-divider\b/,
      ],
      allowlist: new Set([
        path.join(sharedUiRoot, 'ProductGlassToolbar.tsx'),
        path.join(sharedUiRoot, 'ProductGlassToolbar.design-system.tsx'),
      ]),
    },
    {
      familyId: 'product.ui.glass-controls',
      classPatterns: [
        /className\s*=\s*['"`][^'"`]*sniptale-glass-icon-button\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-chip\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-switch\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-range\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-input\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-mini-button\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-preset-list\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-preset-item\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-preset-preview\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-preset-meta\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-preset-name\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-color-trigger\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-color-option\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-bold-button\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-row\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-grid-3\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-dim\b/,
        /className\s*=\s*['"`][^'"`]*sniptale-glass-color-row\b/,
      ],
      allowlist: new Set([
        path.join(sharedUiRoot, 'ProductGlassControls.tsx'),
        path.join(sharedUiRoot, 'ProductGlassControls.layout.tsx'),
        path.join(sharedUiRoot, 'ProductGlassControls.primitives.tsx'),
        path.join(sharedUiRoot, 'ProductGlassControls.color.tsx'),
        path.join(sharedUiRoot, 'ProductGlassControls.design-system.tsx'),
      ]),
    },
  ];
}
