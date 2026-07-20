import type { DesignSystemRegistryEntry } from '../../types';
import { usage, variant } from '../../helpers';

export const SHARED_DESIGN_SYSTEM_CONTENT_OVERLAY_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.expired-overlay',
    labelRu: 'Блокирующий оверлей лицензии',
    labelEn: 'Expired license overlay',
    kind: 'feedback',
    scope: 'shared-ui',
    source: 'apps/extension/src/design-system/previews/expired-overlay/index.tsx',
    sourceFiles: [
      'apps/extension/src/design-system/previews/expired-overlay/index.tsx',
      'apps/extension/src/design-system/previews/expired-overlay/design-system.tsx',
      '@sniptale/ui/styles/glass',
    ],
    descriptionRu:
      'Блокирующее состояние для runtime-поверхностей, когда лицензия истекла и доступ к инструментам закрыт.',
    descriptionEn:
      'Blocking state for runtime surfaces when the license is expired and tools are unavailable.',
    variants: [
      variant(
        'fullscreen',
        'Fullscreen',
        'Fullscreen',
        'Полноэкранный overlay с иконкой, заголовком и поясняющим сообщением.',
        'Fullscreen overlay with an icon, title, and explanatory message.',
        [
          'Рендерится через `ExpiredOverlay`.',
          'Должен перекрывать весь runtime root, а не отдельную карточку.',
        ],
        [
          'Rendered with `ExpiredOverlay`.',
          'Should cover the full runtime root rather than a local card.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'editor.license.expired-overlay',
        'Редактор изображения > Истекшая лицензия > Оверлей',
        'Image editor > Expired license > Overlay',
        ['apps/extension/src/editor/index.tsx']
      ),
      usage(
        'popup.license.expired-overlay',
        'Popup > Истекшая лицензия > Оверлей',
        'Popup > Expired license > Overlay',
        ['apps/extension/src/popup/shell/app/index.tsx']
      ),
      usage(
        'video-editor.license.expired-overlay',
        'Видеоредактор > Истекшая лицензия > Оверлей',
        'Video editor > Expired license > Overlay',
        ['apps/extension/src/video-editor/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/design-system/previews/expired-overlay/index.tsx',
    canonicalPreview: 'apps/extension/src/design-system/previews/expired-overlay/design-system.tsx',
  },
];
