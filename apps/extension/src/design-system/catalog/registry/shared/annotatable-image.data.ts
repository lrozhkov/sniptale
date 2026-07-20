import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const SHARED_DESIGN_SYSTEM_ANNOTATABLE_IMAGE_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.annotatable-image-surface',
    labelRu: 'Annotatable image surface',
    labelEn: 'Annotatable image surface',
    kind: 'composition',
    scope: 'shared-ui',
    source: '@sniptale/ui/annotatable-image-surface',
    sourceFiles: [
      '@sniptale/ui/annotatable-image-surface',
      'apps/extension/src/design-system/previews/annotatable-image-surface/design-system.tsx',
      '@sniptale/ui/annotatable-image-surface',
      'apps/extension/src/design-system/previews/annotatable-image-surface/design-system.tsx',
      'apps/extension/src/design-system/previews/annotatable-image-surface/preview-copy.ts',
    ],
    descriptionRu: [
      'Нейтральный shell для image-stage и toolbar поверхностей,',
      'который используется сценарным quick edit и image editor.',
    ].join(' '),
    descriptionEn: [
      'Neutral shell for image-stage and toolbar surfaces used by',
      'the scenario quick edit flow and the image editor.',
    ].join(' '),
    variants: [
      variant(
        'surface',
        'Stage surface',
        'Stage surface',
        'Общий checker-backed контейнер для канваса, SVG preview и похожих image stages.',
        'Shared checker-backed container for canvas, SVG preview, and similar image stages.',
        ['Рендерится через `AnnotatableImageSurface`.'],
        ['Rendered with `AnnotatableImageSurface`.']
      ),
      variant(
        'toolbar',
        'Image toolbar',
        'Image toolbar',
        'Общий toolbar-shell для локальных image editing control strips.',
        'Shared toolbar shell for local image editing control strips.',
        ['Рендерится через `AnnotatableImageToolbar`.'],
        ['Rendered with `AnnotatableImageToolbar`.']
      ),
    ],
    usageContexts: [
      usage(
        'editor.canvas.stage-shell',
        'Редактор изображения > Canvas shell',
        'Image editor > Canvas shell',
        ['apps/extension/src/editor/workspace/canvas/views.tsx'],
        'active'
      ),
      usage(
        'scenario.quick-edit.stage-shell',
        'Редактор сценариев > Quick edit',
        'Scenario editor > Quick edit',
        [
          'apps/extension/src/scenario-editor/workspace/quick-edit/ScenarioQuickEditTransformSections.tsx',
        ],
        'active'
      ),
    ],
    status: 'planned',
  },
];
