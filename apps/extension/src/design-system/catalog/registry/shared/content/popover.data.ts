import type { DesignSystemRegistryEntry } from '../../types';
import { usage, variant } from '../../helpers';

export const SHARED_DESIGN_SYSTEM_CONTENT_POPOVER_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.content-popover',
    labelRu: 'Контентный popover adapter',
    labelEn: 'Content popover adapter',
    kind: 'composition',
    scope: 'shared-ui',
    source: '@sniptale/ui/content-popover-adapter',
    sourceFiles: [
      '@sniptale/ui/content-popover-adapter',
      'apps/extension/src/design-system/previews/content-popover-adapter/design-system.tsx',
      '@sniptale/ui/content-popover-adapter',
      'apps/extension/src/design-system/previews/content-popover-adapter/design-system.tsx',
      '@sniptale/ui/styles/content-popover',
    ],
    descriptionRu:
      'Адаптер для shadow-root и content-script portal-окружения с calm matte popover-контрактом.',
    descriptionEn:
      'Adapter for shadow-root and content-script portal environments with a calm matte popover contract.',
    variants: [
      variant(
        'popover',
        'Popover adapter',
        'Popover adapter',
        'Оборачивает floating surface и рендерит её в корректный portal target.',
        'Wraps a floating surface and renders it into the correct portal target.',
        ['Использует `ContentPopoverAdapter`.', 'Нужен, когда anchor живёт внутри shadow DOM.'],
        ['Uses `ContentPopoverAdapter`.', 'Needed when the anchor lives inside a shadow DOM.']
      ),
      variant(
        'section',
        'Section adapter',
        'Section adapter',
        'Даёт каноническую matte-секцию для content-script popovers.',
        'Provides the canonical matte section for content-script popovers.',
        [
          'Экспортируется как `ContentPopoverSection`.',
          'Сохраняет одинаковую типографику и spacing для content overlays.',
        ],
        [
          'Exported as `ContentPopoverSection`.',
          'Keeps typography and spacing aligned for content overlays.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.callout-settings.popover',
        'Контент > Настройки callout > Popover adapter',
        'Content > Callout settings > Popover adapter',
        ['apps/extension/src/content/selection/callout-settings-popover/index.tsx']
      ),
      usage(
        'content.step-badge.position-section',
        'Контент > Бейдж шага > Секция позиции',
        'Content > Step badge > Position section',
        ['apps/extension/src/content/selection/step-badge-popover/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/content-popover-adapter',
    canonicalPreview:
      'apps/extension/src/design-system/previews/content-popover-adapter/design-system.tsx',
  },
];
