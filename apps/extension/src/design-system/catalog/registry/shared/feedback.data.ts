import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const SHARED_DESIGN_SYSTEM_FEEDBACK_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.skeleton',
    labelRu: 'Skeleton',
    labelEn: 'Skeleton',
    kind: 'primitive',
    scope: 'shared-ui',
    source: '@sniptale/ui/skeleton',
    sourceFiles: [
      '@sniptale/ui/skeleton',
      'apps/extension/src/design-system/previews/skeleton/design-system.tsx',
    ],
    descriptionRu:
      'Базовый loading placeholder для extension-owned panels, sidebars и status surfaces.',
    descriptionEn:
      'Base loading placeholder for extension-owned panels, sidebars, and status surfaces.',
    variants: [
      variant(
        'lines',
        'Строки',
        'Lines',
        'Набор строковых placeholders для текстовых блоков и списков.',
        'Stacked line placeholders for text blocks and lists.',
        ['Использует `Skeleton` как line-shape.', 'Не должен содержать inline loading copy.'],
        ['Uses `Skeleton` as the line shape.', 'Should not embed inline loading copy.']
      ),
      variant(
        'card',
        'Карточка',
        'Card',
        'Карточный loading shell с avatar/media block и несколькими строками copy.',
        'Card loading shell with an avatar/media block and several copy rows.',
        [
          'Использует один и тот же primitive для block и circle placeholders.',
          'Подходит для shell/loading states в editor и video-editor.',
        ],
        [
          'Reuses the same primitive for block and circle placeholders.',
          'Fits shell loading states in the editor and video editor.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'editor.loading-sidebar',
        'Редактор изображения > Loading sidebar',
        'Image editor > Loading sidebar',
        [
          'apps/extension/src/editor/shell/page/index.tsx',
          'apps/extension/src/editor/workspace/canvas/index.tsx',
        ]
      ),
      usage('popup.loading-view', 'Popup > Loading view', 'Popup > Loading view', [
        'apps/extension/src/popup/shell/tabs/index.tsx',
      ]),
      usage(
        'settings.loading-sections',
        'Настройки > Loading sections',
        'Settings > Loading sections',
        [
          'apps/extension/src/settings/section-surface/loading-state.tsx',
          'apps/extension/src/settings/sections/highlighter/section/index.tsx',
          'apps/extension/src/settings/sections/ai-providers/index.tsx',
          'apps/extension/src/settings/sections/quick-actions/list.tsx',
          'apps/extension/src/settings/sections/templates/content.tsx',
        ]
      ),
      usage(
        'video-editor.loading-screen',
        'Видео-редактор > Loading screen',
        'Video editor > Loading screen',
        [
          'apps/extension/src/video-editor/shell/status-screen/index.tsx',
          'apps/extension/src/video-editor/diagnostics/panel/states.tsx',
        ]
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/skeleton',
    canonicalPreview: 'apps/extension/src/design-system/previews/skeleton/design-system.tsx',
  },
];
