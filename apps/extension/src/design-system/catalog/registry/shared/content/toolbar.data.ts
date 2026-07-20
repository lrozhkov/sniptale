import type { DesignSystemRegistryEntry } from '../../types';
import { usage, variant } from '../../helpers';

export const SHARED_DESIGN_SYSTEM_CONTENT_TOOLBAR_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.content-toolbar',
    labelRu: 'Контентный toolbar adapter',
    labelEn: 'Content toolbar adapter',
    kind: 'composition',
    scope: 'shared-ui',
    source: '@sniptale/ui/content-toolbar',
    sourceFiles: [
      '@sniptale/ui/content-toolbar',
      'apps/extension/src/design-system/previews/content-toolbar/design-system.tsx',
      '@sniptale/ui/content-toolbar',
      'apps/extension/src/design-system/previews/content-toolbar/design-system.tsx',
      'apps/extension/src/design-system/previews/content-toolbar/previews.tsx',
      '@sniptale/ui/styles/toolbar',
      '@sniptale/ui/styles/toolbar/shell',
    ],
    descriptionRu: [
      'Нормализованный toolbar-контракт для content capture surfaces',
      'с shell, shell-композицией и кнопками разных тонов.',
    ].join(' '),
    descriptionEn: [
      'Normalized toolbar contract for content capture surfaces with the shell,',
      'shell-composition primitives, and multiple button tones.',
    ].join(' '),
    variants: [
      variant(
        'shell',
        'Toolbar shell',
        'Toolbar shell',
        'Корневой контейнер toolbar с drag-state и базовой стеклянной рамкой.',
        'Root toolbar container with drag state and base glass framing.',
        ['Рендерится через `ContentToolbarShell`.', 'Поддерживает `dragging` и `dataUi`.'],
        ['Rendered with `ContentToolbarShell`.', 'Supports `dragging` and `dataUi`.']
      ),
      variant(
        'drag-handle',
        'Drag handle',
        'Drag handle',
        'Выделенный handle для перетаскивания toolbar без raw class-markup в feature-коде.',
        'Dedicated handle for dragging the toolbar without raw class markup in feature code.',
        ['Рендерится через `ContentToolbarDragHandle`.', 'Обычно содержит icon-only grip SVG.'],
        ['Rendered with `ContentToolbarDragHandle`.', 'Usually contains an icon-only grip SVG.']
      ),
      variant(
        'group',
        'Toolbar group',
        'Toolbar group',
        'Группа соседних toolbar actions и utility clusters внутри shell.',
        'Group wrapper for adjacent toolbar actions and utility clusters inside the shell.',
        [
          'Рендерится через `ContentToolbarGroup`.',
          'Utility cluster поддерживается через `utilities={true}`.',
        ],
        [
          'Rendered with `ContentToolbarGroup`.',
          'The utility cluster is enabled with `utilities={true}`.',
        ]
      ),
      variant(
        'divider',
        'Divider',
        'Divider',
        'Вертикальный разделитель между capture/action groups.',
        'Vertical divider between capture and action groups.',
        [
          'Рендерится через `ContentToolbarDivider`.',
          'Нужен внутри shell, а не как отдельный floating element.',
        ],
        [
          'Rendered with `ContentToolbarDivider`.',
          'Meant to live inside the shell rather than as a standalone floating element.',
        ]
      ),
      variant(
        'spacer',
        'Spacer',
        'Spacer',
        'Гибкий spacer, который отталкивает close-actions к правому краю toolbar.',
        'Flexible spacer that pushes close actions to the right edge of the toolbar.',
        [
          'Рендерится через `ContentToolbarSpacer`.',
          'Поддерживает shell-level alignment без ad hoc flex divs.',
        ],
        [
          'Rendered with `ContentToolbarSpacer`.',
          'Keeps shell-level alignment without ad hoc flex divs.',
        ]
      ),
      variant(
        'button',
        'Toolbar button',
        'Toolbar button',
        'Нейтральная кнопка внутри toolbar для переключателей и обычных действий.',
        'Neutral toolbar button for toggles and regular actions.',
        ['Рендерится через `ContentToolbarButton`.', 'По умолчанию использует `tone="default"`.'],
        ['Rendered with `ContentToolbarButton`.', 'Defaults to `tone="default"`.']
      ),
      variant(
        'danger',
        'Danger button',
        'Danger button',
        'Кнопка с destructive hover-state для очистки и удаления.',
        'Button with a destructive hover state for clear and delete actions.',
        ['Использует `tone="danger"`.', 'Подходит для clear/stop/destructive intent.'],
        ['Uses `tone="danger"`.', 'Fits clear, stop, and destructive intent.']
      ),
      variant(
        'close',
        'Close button',
        'Close button',
        'Закрывающая кнопка для отключения режима и выхода из capture flow.',
        'Close button for disabling a mode and exiting the capture flow.',
        ['Использует `tone="close"`.', 'Комбинируется с tooltip и icon-only content.'],
        ['Uses `tone="close"`.', 'Usually paired with a tooltip and icon-only content.']
      ),
    ],
    usageContexts: [
      usage(
        'content.toolbar.root',
        'Контент > Toolbar > Root shell',
        'Content > Toolbar > Root shell',
        ['apps/extension/src/content/overlay/toolbar/view.tsx']
      ),
      usage(
        'content.toolbar.capture-actions',
        'Контент > Toolbar > Capture actions group',
        'Content > Toolbar > Capture actions group',
        ['apps/extension/src/content/overlay/toolbar/capture/index.tsx']
      ),
      usage(
        'content.toolbar.close-screenshot-button',
        'Контент > Toolbar > Кнопка выключения режима',
        'Content > Toolbar > Disable mode button',
        ['apps/extension/src/content/overlay/toolbar/view.tsx']
      ),
      usage(
        'content.toolbar.highlighter-button',
        'Контент > Toolbar > Кнопка выделения',
        'Content > Toolbar > Highlighter button',
        ['apps/extension/src/content/overlay/toolbar/view.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/content-toolbar',
    canonicalPreview: 'apps/extension/src/design-system/previews/content-toolbar/design-system.tsx',
  },
];
