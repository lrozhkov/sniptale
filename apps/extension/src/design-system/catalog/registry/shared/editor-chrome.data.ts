import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const SHARED_DESIGN_SYSTEM_EDITOR_CHROME_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.editor-chrome',
    labelRu: 'Editor chrome primitives',
    labelEn: 'Editor chrome primitives',
    kind: 'primitive',
    scope: 'shared-ui',
    source: '@sniptale/ui/editor-chrome',
    sourceFiles: [
      '@sniptale/ui/editor-chrome',
      'apps/extension/src/design-system/previews/editor-chrome/design-system.tsx',
    ],
    descriptionRu:
      'Общие toolbar primitives для editor и scenario-editor: icon-button, divider и compact value badge.',
    descriptionEn:
      'Shared toolbar primitives for editor and scenario-editor: icon button, divider, and compact value badge.',
    variants: [
      variant(
        'icon-button',
        'Иконка-кнопка',
        'Icon button',
        'Нейтральная toolbar-кнопка для history, panel toggles и secondary actions.',
        'Neutral toolbar button for history, panel toggles, and secondary actions.',
        ['Рендерится через `EditorIconButton`.', 'Требует `title` для `aria-label`.'],
        ['Rendered via `EditorIconButton`.', 'Requires `title` for the `aria-label`.']
      ),
      variant(
        'danger-icon-button',
        'Danger иконка-кнопка',
        'Danger icon button',
        'Вариант для destructive или reset-like действий внутри toolbar.',
        'Variant for destructive or reset-like actions inside a toolbar.',
        ['Использует `danger`.', 'Сохраняет тот же размер и интерактивный контракт.'],
        ['Uses `danger`.', 'Preserves the same size and interaction contract.']
      ),
      variant(
        'value-badge',
        'Value badge и divider',
        'Value badge and divider',
        'Компактная метка значения и разделитель для плотных toolbar-групп.',
        'Compact value badge and divider for dense toolbar groups.',
        ['Рендерится через `ValueBadge` и `EditorDivider`.'],
        ['Rendered via `ValueBadge` and `EditorDivider`.']
      ),
    ],
    usageContexts: [
      usage(
        'editor.toolbar.chrome',
        'Редактор изображения > Toolbar primitives',
        'Image editor > Toolbar primitives',
        ['apps/extension/src/editor/chrome/ui/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/editor-chrome',
    canonicalPreview: 'apps/extension/src/design-system/previews/editor-chrome/design-system.tsx',
  },
];
