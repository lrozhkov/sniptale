import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const SHARED_DESIGN_SYSTEM_COMMANDS_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.command-palette',
    labelRu: 'Command Palette',
    labelEn: 'Command palette',
    kind: 'composition',
    scope: 'shared-ui',
    source: 'apps/extension/src/ui/command-palette/index.tsx',
    sourceFiles: [
      'apps/extension/src/ui/command-palette/index.tsx',
      'apps/extension/src/ui/command-palette/types.ts',
      'apps/extension/src/ui/command-palette/hotkey.ts',
      'apps/extension/src/design-system/previews/command-palette/design-system.tsx',
      'apps/extension/src/ui/command-palette/helpers.ts',
      'apps/extension/src/ui/command-palette/types.ts',
      'apps/extension/src/ui/command-palette/sections.tsx',
      'apps/extension/src/ui/command-palette/views.tsx',
      'apps/extension/src/ui/command-palette/index.tsx',
      'apps/extension/src/ui/command-palette/hotkey.ts',
      'apps/extension/src/ui/command-palette/controller.ts',
    ],
    descriptionRu:
      'Единая keyboard-first modal surface для поиска действий, переходов и быстрых команд в popup, settings и полноэкранных runtime.',
    descriptionEn:
      'Shared keyboard-first modal surface for searching actions, routes, and shortcuts across popup, settings, and full-page runtimes.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Базовая palette с поисковой строкой, списком результатов и shortcut-hints.',
        'Default palette with the search input, result list, and shortcut hints.',
        [
          'Использует `CommandPalette`.',
          'Должен получать реальные runtime actions вместо synthetic demo-only handlers.',
        ],
        [
          'Uses `CommandPalette`.',
          'Should receive real runtime actions rather than synthetic demo-only handlers.',
        ]
      ),
      variant(
        'empty',
        'Empty state',
        'Empty state',
        'Состояние без совпадений после фильтрации или при пустом action set.',
        'No-results state after filtering or when the action set is empty.',
        [
          'Показывает shared empty copy из i18n.',
          'Не должен рендерить raw inline strings в preview или runtime.',
        ],
        [
          'Uses shared empty copy from i18n.',
          'Should not render raw inline strings in preview or runtime.',
        ]
      ),
    ],
    usageContexts: [
      usage('popup.command-palette', 'Popup > Command Palette', 'Popup > Command palette', [
        'apps/extension/src/popup/shell/command-palette/index.tsx',
        'apps/extension/src/popup/shell/app/index.tsx',
      ]),
      usage(
        'settings.command-palette',
        'Настройки > Command Palette',
        'Settings > Command palette',
        [
          'apps/extension/src/settings/shell/command-palette/index.tsx',
          'apps/extension/src/settings/shell/page/index.tsx',
        ]
      ),
      usage('gallery.command-palette', 'Галерея > Command Palette', 'Gallery > Command palette', [
        'apps/extension/src/gallery/shell/command-palette/index.tsx',
        'apps/extension/src/gallery/shell/app-shell/index.tsx',
      ]),
      usage(
        'design-system.command-palette',
        'Design System > Command Palette',
        'Design System > Command palette',
        [
          'apps/extension/src/design-system/shell/command-palette/index.tsx',
          'apps/extension/src/design-system/shell/page/index.tsx',
        ]
      ),
      usage(
        'editor.command-palette',
        'Редактор изображения > Command Palette',
        'Image editor > Command palette',
        [
          'apps/extension/src/editor/shell/command-palette/index.tsx',
          'apps/extension/src/editor/shell/page/index.tsx',
        ]
      ),
      usage(
        'video-editor.command-palette',
        'Видео-редактор > Command Palette',
        'Video editor > Command palette',
        [
          'apps/extension/src/video-editor/shell/command-palette/index.tsx',
          'apps/extension/src/video-editor/shell/app/index.tsx',
        ]
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/ui/command-palette/index.tsx',
    canonicalPreview: 'apps/extension/src/design-system/previews/command-palette/design-system.tsx',
  },
];
