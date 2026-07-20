import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const PRODUCT_DESIGN_SYSTEM_MODAL_SHELL_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'product.ui.modal-shell',
    labelRu: 'Modal shell',
    labelEn: 'Modal shell',
    kind: 'surface',
    scope: 'product-ui',
    source: '@sniptale/ui/product-modal',
    sourceFiles: [
      '@sniptale/ui/product-modal',
      'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
      '@sniptale/ui/product-modal',
      '@sniptale/ui/product-modal/actions',
      'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
      '@sniptale/ui/product-save-dialog',
      'apps/extension/src/design-system/previews/product-save-dialog/design-system.tsx',
      '@sniptale/ui/product-save-dialog',
      '@sniptale/ui/product-save-dialog/sections',
      '@sniptale/ui/product-save-dialog/types',
      'apps/extension/src/design-system/previews/product-save-dialog/design-system.tsx',
      '@sniptale/ui/styles/ai-modal',
      '@sniptale/ui/styles/overlays',
      '@sniptale/ui/styles/overlays/modal-shell',
      '@sniptale/ui/styles/overlays/save-dialog',
    ],
    descriptionRu:
      'Базовая matte-neutral modal-поверхность продукта с backdrop, subtle accent line, секциями хедера/тела/футера и close action.',
    descriptionEn:
      'Base matte-neutral modal surface with a backdrop, subtle accent line, header/body/footer sections, and a close action.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Основной modal shell для длинных форм и экспортных flows.',
        'Primary modal shell for long forms and export flows.',
        [
          'Использует `.sniptale-modal` и `.sniptale-modal-backdrop`.',
          'Обычно комбинируется с `.sniptale-modal-header`, `.sniptale-modal-body`, `.sniptale-modal-footer`.',
          'Idle chrome остаётся matte-neutral в обеих темах.',
        ],
        [
          'Uses `.sniptale-modal` and `.sniptale-modal-backdrop`.',
          'Usually combined with `.sniptale-modal-header`, `.sniptale-modal-body`, and `.sniptale-modal-footer`.',
          'Idle chrome stays matte-neutral across both themes.',
        ]
      ),
      variant(
        'compact',
        'Compact',
        'Compact',
        'Уплотнённая версия для confirm/form overlays малого размера.',
        'Denser version for smaller confirm and form overlays.',
        [
          'Использует `.sniptale-modal-header-sm`, `.sniptale-modal-body-sm`, `.sniptale-modal-footer-sm`.',
          'Подходит для редакторов сущностей и confirm-потоков.',
        ],
        [
          'Uses `.sniptale-modal-header-sm`, `.sniptale-modal-body-sm`, and `.sniptale-modal-footer-sm`.',
          'Fits entity editors and confirm flows.',
        ]
      ),
      variant(
        'save-dialog',
        'Save dialog',
        'Save dialog',
        'Специализированный shell для выбора сохранения и списков пресетов.',
        'Specialized shell for save-choice flows and preset lists.',
        [
          'Использует `.sniptale-save-dialog` и сопутствующие элементы из overlays.',
          'Сохраняет общий modal contract, но расширяет контентный layout.',
        ],
        [
          'Uses `.sniptale-save-dialog` and related overlay elements.',
          'Keeps the common modal contract while extending content layout.',
        ]
      ),
    ],
    usageContexts: [
      usage('content.ai.modal', 'Контент > AI modal', 'Content > AI modal', [
        'apps/extension/src/content/overlay/ai/modal/shell/index.tsx',
      ]),
      usage(
        'settings.ai-provider.modal',
        'Настройки > AI providers > Form modal',
        'Settings > AI providers > Form modal',
        ['apps/extension/src/settings/sections/ai-providers/surface/modals.tsx']
      ),
      usage(
        'settings.viewport.modal',
        'Настройки > Viewport preset editor',
        'Settings > Viewport preset editor',
        ['apps/extension/src/settings/sections/viewport-presets/editor/index.tsx']
      ),
      usage(
        'content.template-editor.modal',
        'Контент > Template editor > Modal',
        'Content > Template editor > Modal',
        [
          '../../../../features/prompt-templates/editor/index.tsx',
          'apps/extension/src/content/overlay/ai/modal/shell/dialog.tsx',
          'apps/extension/src/settings/sections/templates/content.tsx',
        ]
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-modal',
    canonicalPreview: 'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
  },
];
