import { usage, variant } from '../helpers';
import type { DesignSystemRegistryEntry } from '../types';

export const SHARED_DESIGN_SYSTEM_POPUP_SHELL_INSPECTOR_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.inspector-shell',
    labelRu: 'Shell инспектора',
    labelEn: 'Inspector shell',
    kind: 'composition',
    scope: 'shared-ui',
    source: '@sniptale/ui/inspector-shell',
    sourceFiles: [
      '@sniptale/ui/inspector-shell',
      'apps/extension/src/design-system/previews/inspector-shell/design-system.tsx',
    ],
    descriptionRu:
      'Общий каркас боковых инспекторов для editor и video-editor с frame, panel и header actions.',
    descriptionEn:
      'Shared sidebar shell for editor and video-editor inspectors with frame, panel, and header actions.',
    variants: [
      variant(
        'frame',
        'Frame',
        'Frame',
        'Внешний контейнер, управляющий шириной и состоянием collapse.',
        'Outer container that controls width and collapsed state.',
        [
          'Рендерится через `InspectorShellFrame`.',
          'Ширина задаётся `expandedWidthClassName` и `collapsedWidthClassName`.',
        ],
        [
          'Rendered with `InspectorShellFrame`.',
          'Width is driven by `expandedWidthClassName` and `collapsedWidthClassName`.',
        ]
      ),
      variant(
        'panel',
        'Panel',
        'Panel',
        'Внутренняя стеклянная панель с layout для хедера и контента.',
        'Inner glass panel that hosts header and content layout.',
        [
          'Рендерится через `InspectorShellPanel`.',
          'Используется как полноразмерный flex-column shell.',
        ],
        ['Rendered with `InspectorShellPanel`.', 'Used as a full-size flex-column shell.']
      ),
      variant(
        'header-action',
        'Header action',
        'Header action',
        'Унифицированная кнопка для collapse и secondary actions в хедере инспектора.',
        'Unified button for collapse and secondary actions in the inspector header.',
        [
          'Рендерится через `InspectorShellHeaderAction`.',
          'Обязательно задавать `title` для `aria-label`.',
        ],
        [
          'Rendered with `InspectorShellHeaderAction`.',
          'Always provide `title` for the `aria-label`.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'editor.inspector.sidebar-shell',
        'Редактор изображения > Инспектор > Shell',
        'Image editor > Inspector > Shell',
        ['apps/extension/src/editor/inspector/sidebar/index.tsx']
      ),
      usage(
        'video-editor.workspace.sidebar-shell',
        'Видео-редактор > Workspace sidebar > Shell',
        'Video editor > Workspace sidebar > Shell',
        [
          'apps/extension/src/video-editor/workspace/sidebar/index.tsx',
          'apps/extension/src/video-editor/workspace/sidebar/libraries/index.tsx',
        ]
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/inspector-shell',
    canonicalPreview: 'apps/extension/src/design-system/previews/inspector-shell/design-system.tsx',
  },
];
