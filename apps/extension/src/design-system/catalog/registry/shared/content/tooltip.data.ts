import type { DesignSystemRegistryEntry } from '../../types';
import { usage, variant } from '../../helpers';

export const SHARED_DESIGN_SYSTEM_CONTENT_TOOLTIP_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.content-size-tooltip',
    labelRu: 'Tooltip размера контента',
    labelEn: 'Content size tooltip',
    kind: 'surface',
    scope: 'shared-ui',
    source: '@sniptale/ui/content-size-tooltip',
    sourceFiles: [
      '@sniptale/ui/content-size-tooltip',
      'apps/extension/src/design-system/previews/content-size-tooltip/design-system.tsx',
      '@sniptale/ui/content-size-tooltip/core',
      '@sniptale/ui/content-size-tooltip/dom',
      '@sniptale/ui/content-size-tooltip',
      'apps/extension/src/design-system/previews/content-size-tooltip/design-system.tsx',
      '@sniptale/ui/content-size-tooltip/types',
      'packages/ui/src/content-size-tooltip/views.tsx',
      'packages/ui/src/content-size-tooltip/helpers.ts',
      '@sniptale/ui/content-size-tooltip/styles',
      '@sniptale/ui/content-size-tooltip/core',
      '@sniptale/ui/content-size-tooltip/dom',
    ],
    descriptionRu:
      'Floating tooltip для точной настройки ширины и высоты в content runtime с общим visual contract для React и DOM-веток.',
    descriptionEn:
      'Floating tooltip for precise width and height editing in the content runtime, shared by the React and DOM implementations.',
    variants: [
      variant(
        'floating',
        'Floating tooltip',
        'Floating tooltip',
        'Компактная floating-surface с width/height stepper controls, lock-ratio toggle и confirm actions.',
        'Compact floating surface with width and height steppers, a ratio lock toggle, and confirm actions.',
        [
          'Рендерится через `ContentSizeTooltip` и DOM helper-ветку.',
          'Используется поверх selection и interactive-frame surfaces.',
        ],
        [
          'Rendered through `ContentSizeTooltip` and the DOM helper variant.',
          'Used above selection and interactive-frame surfaces.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.interactive-frame.size-tooltip',
        'Контент > Interactive frame > Tooltip размера',
        'Content > Interactive frame > Size tooltip',
        ['apps/extension/src/content/selection/interactive-frame/size-panel/view.tsx']
      ),
      usage(
        'content.selection.size-tooltip',
        'Контент > Selection mode > Tooltip размера',
        'Content > Selection mode > Size tooltip',
        [
          'apps/extension/src/content/selection/selection-mode/ui/final-elements',
          'apps/extension/src/content/selection/selection-mode/ui/frame-updates',
        ]
      ),
      usage(
        'content.region-selector.size-tooltip',
        'Контент > Region selector > Tooltip размера',
        'Content > Region selector > Size tooltip',
        [
          'apps/extension/src/content/selection/region-selector/tooltip.ts',
          'apps/extension/src/content/selection/region-selector/runtime.ts',
        ]
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/content-size-tooltip',
    canonicalPreview:
      'apps/extension/src/design-system/previews/content-size-tooltip/design-system.tsx',
  },
];
