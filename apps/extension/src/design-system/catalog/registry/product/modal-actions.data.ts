import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const PRODUCT_DESIGN_SYSTEM_MODAL_ACTIONS_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'product.ui.modal-actions',
    labelRu: 'Modal actions',
    labelEn: 'Modal actions',
    kind: 'primitive',
    scope: 'product-ui',
    source: '@sniptale/ui/product-modal/actions',
    sourceFiles: [
      '@sniptale/ui/product-modal/actions',
      'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
      '@sniptale/ui/product-modal/actions',
      'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
      '@sniptale/ui/styles/ai-modal-content',
    ],
    descriptionRu:
      'Borderless кнопочные роли для modal/footer flows с popup-like flat idle state и matte hover/focus surface.',
    descriptionEn:
      'Borderless button roles for modal/footer flows with a popup-like flat idle state and matte hover/focus surfaces.',
    variants: [
      variant(
        'primary',
        'Primary',
        'Primary',
        'Главная завершающая CTA для сохранения, запуска и подтверждения.',
        'Primary completion CTA for save, run, and confirm actions.',
        [
          'Рендерится через shared matte primary button contract.',
          'Idle state остаётся flat, а accent остаётся в focus/selected signal.',
          'Compact density меняет только spacing и не уменьшает высоту или type scale.',
        ],
        [
          'Rendered through the shared matte primary button contract.',
          'The idle state stays flat, with accent reserved for focus and selected signals.',
          'Compact density changes spacing only and does not reduce height or type scale.',
        ]
      ),
      variant(
        'secondary',
        'Secondary',
        'Secondary',
        'Нейтральная кнопка отмены, закрытия и возврата назад.',
        'Neutral action for cancel, close, and back flows.',
        [
          'Рендерится через shared matte secondary button contract.',
          'Не должна конкурировать с primary CTA по визуальному весу.',
        ],
        [
          'Rendered through the shared matte secondary button contract.',
          'Should not compete visually with the primary CTA.',
        ]
      ),
      variant(
        'toggle',
        'Toggle',
        'Toggle',
        'Кнопка-состояние для переключаемых фильтров и альтернативных режимов.',
        'Stateful button for switchable filters and alternate modes.',
        [
          'Рендерится через shared segmented-option contract.',
          'Selected state использует matte surface и selected border вместо accent wash.',
        ],
        [
          'Rendered through the shared segmented-option contract.',
          'The selected state uses a matte surface and selected border instead of an accent wash.',
        ]
      ),
      variant(
        'danger',
        'Danger',
        'Danger',
        'Destructive CTA для delete/reset действий внутри modal footer.',
        'Destructive CTA for delete and reset actions inside modal footers.',
        [
          'Рендерится через shared matte danger button contract.',
          'Нужно использовать только для destructive intent.',
        ],
        [
          'Rendered through the shared matte danger button contract.',
          'Should be used only for destructive intent.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.template-editor.actions',
        'Контент > Template editor > Footer actions',
        'Content > Template editor > Footer actions',
        ['../../../../features/prompt-templates/editor/index.tsx']
      ),
      usage(
        'settings.providers.form-actions',
        'Настройки > AI providers > Form actions',
        'Settings > AI providers > Form actions',
        ['apps/extension/src/settings/sections/ai-providers/surface/modals.tsx']
      ),
      usage(
        'settings.viewport.actions',
        'Настройки > Viewport preset editor > Actions',
        'Settings > Viewport preset editor > Actions',
        ['apps/extension/src/settings/sections/viewport-presets/editor/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-modal/actions',
    canonicalPreview: 'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
  },
];
