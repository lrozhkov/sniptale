import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const SHARED_DESIGN_SYSTEM_COMPACT_INSPECTOR_CONTROLS_REGISTRY: DesignSystemRegistryEntry[] =
  [
    {
      componentId: 'shared.ui.compact-inspector-controls',
      labelRu: 'Compact inspector controls',
      labelEn: 'Compact inspector controls',
      kind: 'primitive',
      scope: 'shared-ui',
      source: 'apps/extension/src/ui/compact-inspector-controls/index.tsx',
      sourceFiles: [
        'apps/extension/src/ui/compact-inspector-controls/index.tsx',
        'apps/extension/src/design-system/previews/compact-inspector-controls/design-system.tsx',
        'apps/extension/src/ui/compact-inspector-controls/layout.tsx',
        'apps/extension/src/ui/compact-inspector-controls/numeric.tsx',
        '@sniptale/ui/compact-inspector-controls/focus',
        'apps/extension/src/ui/compact-inspector-controls/scrubber.tsx',
        'apps/extension/src/ui/compact-inspector-controls/stepper.tsx',
        'apps/extension/src/ui/compact-inspector-controls/select.tsx',
        'apps/extension/src/ui/compact-inspector-controls/select-menu.tsx',
        '@sniptale/ui/compact-inspector-controls/select-helpers',
        'apps/extension/src/ui/compact-inspector-controls/controls.tsx',
        'apps/extension/src/ui/compact-inspector-controls/text-field.tsx',
        'apps/extension/src/ui/compact-inspector-controls/list.tsx',
      ],
      descriptionRu:
        'Плотные matte controls для inspector/sidebar интерфейсов в editor, scenario-editor и video-editor.',
      descriptionEn:
        'Dense matte controls for inspector/sidebar interfaces in the image, scenario, and video editors.',
      variants: [
        variant(
          'input',
          'Compact input',
          'Compact input',
          'Однострочное поле для плотных inspector forms.',
          'Single-line field for dense inspector forms.',
          ['Рендерится через `CompactInput`.', 'Опирается на shared `ProductInput`.'],
          ['Rendered via `CompactInput`.', 'Built on top of shared `ProductInput`.']
        ),
        variant(
          'text-field',
          'Text field',
          'Text field',
          'Строка текстового ввода с названием слева и прозрачным input справа.',
          'Text-entry row with the field name on the left and a transparent input on the right.',
          ['Рендерится через `TextField`.', 'Следует row contract `SelectField/ColorField`.'],
          ['Rendered via `TextField`.', 'Follows the `SelectField/ColorField` row contract.']
        ),
        variant(
          'select',
          'Compact select',
          'Compact select',
          'Плотный select для tool/sidebar параметров.',
          'Dense select for tool and sidebar parameters.',
          ['Рендерится через `CompactSelect`.', 'Имеет собственный compact trigger/menu.'],
          ['Rendered via `CompactSelect`.', 'Owns a dedicated compact trigger and menu.']
        ),
        variant(
          'select-field',
          'Select field',
          'Select field',
          'Строка выбора с названием слева и compact select справа.',
          'Selection row with the field name on the left and compact select on the right.',
          ['Рендерится через `SelectField`.', 'Следует тому же row contract, что `NumericRow`.'],
          ['Rendered via `SelectField`.', 'Follows the same row contract as `NumericRow`.']
        ),
        variant(
          'panel-header',
          'Panel header',
          'Panel header',
          'Uppercase title-only header для compact inspector groups.',
          'Uppercase title-only header for compact inspector groups.',
          ['Рендерится через `PanelHeader`.', 'Не содержит close/toggle/actions.'],
          ['Rendered via `PanelHeader`.', 'Has no close, toggle, or action affordances.']
        ),
        variant(
          'numeric-row',
          'Numeric row',
          'Numeric row',
          'Единая строка постоянных числовых настроек.',
          'Canonical row for persistent numeric settings.',
          [
            'Рендерится через `NumericRow` и `NumericValueField`.',
            'Покрывает input, stepper, invalid, disabled и row-level range states.',
          ],
          [
            'Rendered via `NumericRow` and `NumericValueField`.',
            'Covers input, stepper, invalid, disabled, and row-level range states.',
          ]
        ),
        variant(
          'toggle-row',
          'Toggle row',
          'Toggle row',
          'Компактная логическая строка без full-row active fill.',
          'Compact boolean row without full-row active fill.',
          [
            'Рендерится через `OptionRow`.',
            'Состояние показывается маленьким switch/check справа.',
          ],
          ['Rendered via `OptionRow`.', 'State is shown by a small right-side switch/check.']
        ),
        variant(
          'preset-list',
          'Preset list',
          'Preset list',
          'Grouped list view для шаблонов inspector UI.',
          'Grouped list view for inspector templates.',
          ['Рендерится через `PresetList`.', 'Пустые группы не показываются.'],
          ['Rendered via `PresetList`.', 'Empty groups are not rendered.']
        ),
        variant(
          'reference-panel',
          'Reference panel',
          'Reference panel',
          'Эталонная compact inspector панель для visual parity проверок.',
          'Reference compact inspector panel for visual parity checks.',
          [
            'Собирает `PanelHeader`, `NumericRow` и `ColorField` в одном макете.',
            'Используется как baseline перед миграцией editor owners.',
          ],
          [
            'Combines `PanelHeader`, `NumericRow`, and `ColorField` in one layout.',
            'Used as the baseline before migrating editor owners.',
          ]
        ),
        variant(
          'range',
          'Compact range',
          'Compact range',
          'Slider только для gradient/range-specific UX.',
          'Slider reserved for gradient and range-specific UX.',
          ['Рендерится через `CompactRange`.', 'Не используется для постоянных numeric rows.'],
          ['Rendered via `CompactRange`.', 'Not used for persistent numeric rows.']
        ),
        variant(
          'color-option',
          'Compact color option',
          'Compact color option',
          'Компактный swatch для matte inspector/color popovers.',
          'Compact swatch for matte inspector and color-popover surfaces.',
          ['Рендерится через `CompactColorOption`.', 'Используется в image editor color controls.'],
          ['Rendered via `CompactColorOption`.', 'Used by image editor color controls.']
        ),
      ],
      usageContexts: [
        usage(
          'editor.inspector.compact-controls',
          'Редактор изображения > Inspector controls',
          'Image editor > Inspector controls',
          [
            'apps/extension/src/editor/chrome/color-control/shared.tsx',
            'apps/extension/src/editor/chrome/ui/primitives.tsx',
            'apps/extension/src/editor/chrome/ui/index.tsx',
          ]
        ),
      ],
      status: 'active',
      previewFidelity: 'canonical',
      canonicalImplementation: 'apps/extension/src/ui/compact-inspector-controls/index.tsx',
      canonicalPreview:
        'apps/extension/src/design-system/previews/compact-inspector-controls/design-system.tsx',
    },
  ];
