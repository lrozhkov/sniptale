import type { DesignSystemRegistryEntry } from '../../types';
import { usage, variant } from '../../helpers';

export const PRODUCT_DESIGN_SYSTEM_GLASS_TOOLBAR_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'product.ui.glass-toolbar',
    labelRu: 'Glass toolbar',
    labelEn: 'Glass toolbar',
    kind: 'surface',
    scope: 'product-ui',
    source: '@sniptale/ui/product-glass-toolbar',
    sourceFiles: [
      '@sniptale/ui/product-glass-toolbar',
      'apps/extension/src/design-system/previews/product-glass-toolbar/design-system.tsx',
      '@sniptale/ui/product-glass-toolbar',
      'apps/extension/src/design-system/previews/product-glass-toolbar/design-system.tsx',
      '@sniptale/ui/styles/glass',
      '@sniptale/ui/styles/glass/toolbar-form-layout',
    ],
    descriptionRu:
      'Стеклянный floating-toolbar для quick edit и inline-действий поверх выделенного фрейма.',
    descriptionEn:
      'Glass floating toolbar for quick edit and inline actions on top of a selected frame.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Нейтральная toolbar-кнопка внутри стеклянного toolbar.',
        'Neutral toolbar button inside the glass toolbar.',
        [
          'Использует `.sniptale-glass-toolbar` и `.sniptale-glass-toolbar-button`.',
          'Подходит для форматирования и навигационных действий.',
        ],
        [
          'Uses `.sniptale-glass-toolbar` and `.sniptale-glass-toolbar-button`.',
          'Fits formatting and navigation actions.',
        ]
      ),
      variant(
        'active',
        'Active',
        'Active',
        'Нажатое или выбранное состояние кнопки внутри glass-toolbar.',
        'Pressed or selected state inside the glass toolbar.',
        [
          'Использует `.sniptale-glass-toolbar-button--active`.',
          'Подсвечивает текущий включённый инструмент.',
        ],
        ['Uses `.sniptale-glass-toolbar-button--active`.', 'Highlights the currently enabled tool.']
      ),
      variant(
        'danger',
        'Danger',
        'Danger',
        'Destructive hover-treatment для удаления и сброса.',
        'Destructive hover treatment for delete and reset actions.',
        [
          'Использует `.sniptale-glass-toolbar-button--danger`.',
          'Не должен применяться к обычным secondary actions.',
        ],
        [
          'Uses `.sniptale-glass-toolbar-button--danger`.',
          'Should not be applied to ordinary secondary actions.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.interactive-frame.toolbar',
        'Контент > Interactive frame > Glass toolbar',
        'Content > Interactive frame > Glass toolbar',
        ['apps/extension/src/content/selection/interactive-frame/toolbar/index.tsx']
      ),
      usage(
        'content.callout.format-toolbar',
        'Контент > Callout > Format toolbar',
        'Content > Callout > Format toolbar',
        ['apps/extension/src/content/selection/callout/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-glass-toolbar',
    canonicalPreview:
      'apps/extension/src/design-system/previews/product-glass-toolbar/design-system.tsx',
  },
];
