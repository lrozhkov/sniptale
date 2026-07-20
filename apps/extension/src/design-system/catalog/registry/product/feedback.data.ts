import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const PRODUCT_DESIGN_SYSTEM_FEEDBACK_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'product.ui.confirm-dialog',
    labelRu: 'Confirm dialog',
    labelEn: 'Confirm dialog',
    kind: 'feedback',
    scope: 'product-ui',
    source: '@sniptale/ui/product-feedback/confirm-dialog',
    sourceFiles: [
      '@sniptale/ui/product-feedback/confirm-dialog',
      'apps/extension/src/design-system/previews/product-feedback/confirm-dialog/design-system.tsx',
      '@sniptale/ui/styles/toolbar/transient/feedback',
    ],
    descriptionRu: 'Компактный dialog для подтверждения destructive и irreversible действий.',
    descriptionEn: 'Compact dialog for confirming destructive and irreversible actions.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Диалог с нейтральной отменой и основным подтверждением.',
        'Dialog with a neutral cancel action and a primary confirm action.',
        [
          'Использует `.sniptale-confirm-dialog` и shared modal action buttons.',
          'Формат подходит для delete/reset confirmations.',
        ],
        [
          'Uses `.sniptale-confirm-dialog` with shared modal action buttons.',
          'The format fits delete and reset confirmations.',
        ]
      ),
      variant(
        'danger',
        'Danger confirm',
        'Danger confirm',
        'Подтверждающая destructive CTA внутри confirm-dialog.',
        'Destructive confirmation CTA inside the confirm dialog.',
        [
          'Использует shared danger CTA contract внутри compact confirm shell.',
          'Нужно оставлять единственной опасной CTA внутри блока.',
        ],
        [
          'Uses the shared danger CTA contract inside the compact confirm shell.',
          'Should remain the only dangerous CTA in the block.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.ai.confirm-dialog',
        'Контент > AI > Confirm dialog',
        'Content > AI > Confirm dialog',
        ['apps/extension/src/content/overlay/ai/template-list/view/dialogs.tsx']
      ),
      usage(
        'settings.providers.confirm-dialog',
        'Настройки > AI providers > Confirm dialog',
        'Settings > AI providers > Confirm dialog',
        [
          'apps/extension/src/settings/sections/ai-providers/surface/content.tsx',
          'apps/extension/src/settings/sections/save-presets/surface/overlays.tsx',
          'apps/extension/src/settings/sections/viewport-presets/section-content/content.tsx',
          'apps/extension/src/settings/sections/templates/content.tsx',
          'apps/extension/src/settings/sections/quick-actions/index.tsx',
        ]
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-feedback/confirm-dialog',
    canonicalPreview:
      'apps/extension/src/design-system/previews/product-feedback/confirm-dialog/design-system.tsx',
  },
  {
    componentId: 'product.ui.toast',
    labelRu: 'Toast и countdown feedback',
    labelEn: 'Toast and countdown feedback',
    kind: 'feedback',
    scope: 'product-ui',
    source: '@sniptale/ui/product-feedback/toast',
    sourceFiles: [
      '@sniptale/ui/product-feedback/toast',
      'apps/extension/src/design-system/previews/product-feedback/toast/design-system.tsx',
      '@sniptale/ui/styles/feedback',
      '@sniptale/ui/styles/overlays/countdown',
    ],
    descriptionRu:
      'Нейтральный toast feedback для runtime-статусов и отдельный countdown surface для time-based переходов.',
    descriptionEn:
      'Neutral toast feedback for runtime statuses and a dedicated countdown surface for time-based transitions.',
    variants: [
      variant(
        'success',
        'Success',
        'Success',
        'Спокойное подтверждение успешно завершённого действия.',
        'Restrained confirmation that an action completed successfully.',
        [
          'Использует `.sniptale-toast-success`.',
          'Статус читается через мягкий accent и нейтральную panel surface.',
        ],
        [
          'Uses `.sniptale-toast-success`.',
          'Status relies on a soft accent over a neutral panel surface.',
        ]
      ),
      variant(
        'error',
        'Error',
        'Error',
        'Ошибочный runtime feedback без агрессивной декоративности.',
        'Runtime error feedback without aggressive decorative treatment.',
        ['Использует `.sniptale-toast-error`.', 'Фраза должна сразу объяснять, что не удалось.'],
        ['Uses `.sniptale-toast-error`.', 'The copy should explain immediately what failed.']
      ),
      variant(
        'countdown',
        'Countdown',
        'Countdown',
        'Отдельный countdown-toast перед стартом записи.',
        'Dedicated countdown toast before a recording starts.',
        [
          'Использует `.sniptale-countdown-toast` и related overlay classes.',
          'Должен оставаться в том же нейтральном surface language, что и обычные toasts.',
        ],
        [
          'Uses `.sniptale-countdown-toast` and related overlay classes.',
          'Should stay in the same neutral surface language as regular toasts.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.toast.runtime',
        'Контент > Runtime toast feedback',
        'Content > Runtime toast feedback',
        ['@sniptale/ui/product-feedback/toast-service']
      ),
      usage('content.video.countdown', 'Контент > Video countdown', 'Content > Video countdown', [
        'apps/extension/src/content/overlay/countdown-toast/index.tsx',
        'apps/extension/src/content/overlay/video-countdown/index.tsx',
      ]),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-feedback/toast',
    canonicalPreview:
      'apps/extension/src/design-system/previews/product-feedback/toast/design-system.tsx',
  },
];
