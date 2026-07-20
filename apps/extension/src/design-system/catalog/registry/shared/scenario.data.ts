import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const SHARED_DESIGN_SYSTEM_SCENARIO_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.searchable-project-picker',
    labelRu: 'Searchable project picker',
    labelEn: 'Searchable project picker',
    kind: 'surface',
    scope: 'shared-ui',
    source: '@sniptale/ui/searchable-project-picker',
    sourceFiles: [
      '@sniptale/ui/searchable-project-picker',
      'apps/extension/src/design-system/previews/searchable-project-picker/design-system.tsx',
      '@sniptale/ui/searchable-project-picker',
      'apps/extension/src/design-system/previews/searchable-project-picker/design-system.tsx',
      '@sniptale/ui/searchable-project-picker/layout',
      '@sniptale/ui/searchable-project-picker/parts',
      'apps/extension/src/design-system/previews/searchable-project-picker/preview-copy.ts',
      '@sniptale/ui/searchable-project-picker/helpers',
    ],
    descriptionRu:
      'Общий picker сценарных проектов с поиском, блоком recent и inline-созданием проекта.',
    descriptionEn:
      'Shared scenario-project picker with search, recent section, and inline project creation.',
    variants: [
      variant(
        'default',
        'Базовый picker',
        'Default picker',
        'Полный сценарный picker с поиском, recent-блоком и активным проектом.',
        'Full scenario picker with search, recent section, and active project state.',
        ['Рендерится через `SearchableProjectPicker`.'],
        ['Rendered with `SearchableProjectPicker`.']
      ),
      variant(
        'empty',
        'Пустое состояние',
        'Empty state',
        'Состояние без проектов, где пользователь сразу создаёт новый сценарий.',
        'Empty state where the user can immediately create a new scenario.',
        ['Использует тот же shared component без runtime-specific wiring.'],
        ['Uses the same shared component without runtime-specific wiring.']
      ),
    ],
    usageContexts: [
      usage(
        'content.scenario.project-menu',
        'Контент > Scenario recorder > Меню проекта',
        'Content > Scenario recorder > Project menu',
        ['apps/extension/src/content/overlay/toolbar/scenario/project-menu/index.tsx']
      ),
      usage(
        'scenario.editor.project-sidebar',
        'Редактор сценариев > Sidebar > Picker проекта',
        'Scenario editor > Sidebar > Project picker',
        [
          'apps/extension/src/scenario-editor/page-shell/slide-navigator/ScenarioSlideNavigatorProjectsView.tsx',
        ]
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/searchable-project-picker',
    canonicalPreview:
      'apps/extension/src/design-system/previews/searchable-project-picker/design-system.tsx',
  },
  {
    componentId: 'shared.ui.scenario-capture-metadata-dialog',
    labelRu: 'Scenario capture metadata dialog',
    labelEn: 'Scenario capture metadata dialog',
    kind: 'surface',
    scope: 'shared-ui',
    source: 'apps/extension/src/features/scenario/capture-metadata-dialog/index.tsx',
    sourceFiles: [
      'apps/extension/src/features/scenario/capture-metadata-dialog/index.tsx',
      'apps/extension/src/design-system/previews/scenario-capture-metadata-dialog/design-system.tsx',
      'apps/extension/src/features/scenario/capture-metadata-dialog/index.tsx',
      'apps/extension/src/design-system/previews/scenario-capture-metadata-dialog/design-system.tsx',
    ],
    descriptionRu:
      'Общий read-only диалог, который показывает человекочитаемые метаданные захваченного scenario шага.',
    descriptionEn:
      'Shared read-only dialog that presents human-readable metadata collected for a captured scenario step.',
    variants: [
      variant(
        'default',
        'Базовый диалог',
        'Default dialog',
        'Полноразмерный modal с секциями target, page, capture, pointer и scroll.',
        'Full-size modal with target, page, capture, pointer, and scroll sections.',
        ['Использует общий modal shell и метаданные захвата без raw JSON.'],
        ['Uses the shared modal shell and capture metadata without exposing raw JSON.']
      ),
    ],
    usageContexts: [
      usage(
        'content.scenario.sidebar.metadata',
        'Контент > Scenario recorder > Просмотр метаданных шага',
        'Content > Scenario recorder > Step metadata inspection',
        ['apps/extension/src/content/overlay/scenario-recorder/sidebar/index.tsx']
      ),
      usage(
        'scenario.editor.navigator.metadata',
        'Редактор сценариев > Navigator > Просмотр метаданных шага',
        'Scenario editor > Navigator > Step metadata inspection',
        ['apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation:
      'apps/extension/src/features/scenario/capture-metadata-dialog/index.tsx',
    canonicalPreview:
      'apps/extension/src/design-system/previews/scenario-capture-metadata-dialog/design-system.tsx',
  },
];
