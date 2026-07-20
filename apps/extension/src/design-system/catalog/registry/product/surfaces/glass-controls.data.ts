import type { DesignSystemRegistryEntry } from '../../types';
import { usage, variant } from '../../helpers';

export const PRODUCT_DESIGN_SYSTEM_GLASS_CONTROLS_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'product.ui.glass-controls',
    labelRu: 'Glass controls',
    labelEn: 'Glass controls',
    kind: 'primitive',
    scope: 'product-ui',
    source: '@sniptale/ui/product-glass-controls',
    sourceFiles: [
      '@sniptale/ui/product-glass-controls',
      'apps/extension/src/design-system/previews/product-glass-controls/design-system.tsx',
      '@sniptale/ui/product-glass-controls/controls',
      '@sniptale/ui/product-glass-controls/primitives',
      '@sniptale/ui/product-glass-controls/color',
      '@sniptale/ui/product-glass-controls/layout',
      'apps/extension/src/design-system/previews/product-glass-controls/design-system.tsx',
      '@sniptale/ui/styles/glass',
      '@sniptale/ui/styles/glass/popover-controls',
      '@sniptale/ui/styles/glass/input-controls',
      '@sniptale/ui/styles/glass/color-controls',
      '@sniptale/ui/styles/glass/step-badge',
      '@sniptale/ui/glass-popover/controls-styles.data',
      '@sniptale/ui/glass-popover/toolbar-form-input-styles.data',
      '@sniptale/ui/glass-popover/toolbar-form-color-styles.data',
      '@sniptale/ui/glass-popover/toolbar-form-styles.data',
    ],
    descriptionRu:
      'Набор стеклянных контролов для popovers: chips, icon buttons, switches, ranges, inputs и preset lists.',
    descriptionEn:
      'Set of glass controls for popovers: chips, icon buttons, switches, ranges, inputs, and preset lists.',
    variants: [
      variant(
        'chip',
        'Chip',
        'Chip',
        'Плотный selectable control для режимов, размеров и stacked options.',
        'Dense selectable control for modes, sizes, and stacked options.',
        [
          'Использует `.sniptale-glass-chip` и `.sniptale-glass-chip--active`.',
          'Stacked режим доступен через `.sniptale-glass-chip--stacked`.',
        ],
        [
          'Uses `.sniptale-glass-chip` and `.sniptale-glass-chip--active`.',
          'The stacked mode is available through `.sniptale-glass-chip--stacked`.',
        ]
      ),
      variant(
        'icon-button',
        'Icon button',
        'Icon button',
        'Кнопка-иконка для directional, alignment и color tool actions.',
        'Icon-only button for directional, alignment, and color tool actions.',
        [
          'Использует `.sniptale-glass-icon-button`.',
          'Active state оформляется через `.sniptale-glass-icon-button--active`.',
        ],
        [
          'Uses `.sniptale-glass-icon-button`.',
          'The active state is provided by `.sniptale-glass-icon-button--active`.',
        ]
      ),
      variant(
        'switch',
        'Switch row',
        'Switch row',
        'Строка с подписью и переключателем on/off.',
        'Row with copy on the left and an on/off switch on the right.',
        [
          'Использует `.sniptale-glass-toggle-row` и `.sniptale-glass-switch`.',
          'Включённое состояние задаётся `.sniptale-glass-switch--on`.',
        ],
        [
          'Uses `.sniptale-glass-toggle-row` and `.sniptale-glass-switch`.',
          'The enabled state is added via `.sniptale-glass-switch--on`.',
        ]
      ),
      variant(
        'input',
        'Input',
        'Input',
        'Компактный field для чисел и коротких значений внутри popover.',
        'Compact field for numbers and short values inside a popover.',
        ['Использует `.sniptale-glass-input`.', 'Обычно сопровождается мини-кнопками +/-.'],
        ['Uses `.sniptale-glass-input`.', 'Often paired with +/- mini buttons.']
      ),
      variant(
        'range',
        'Range',
        'Range',
        'Слайдер и meta-строка для непрерывных параметров.',
        'Slider with a metadata row for continuous parameters.',
        [
          'Использует `.sniptale-glass-range` и `.sniptale-glass-range-meta`.',
          'Хорошо работает в отдельной секции с label сверху.',
        ],
        [
          'Uses `.sniptale-glass-range` and `.sniptale-glass-range-meta`.',
          'Works best in a dedicated section with a label above it.',
        ]
      ),
      variant(
        'preset-list',
        'Preset list',
        'Preset list',
        'Список пресетов с превью, названием и активным состоянием.',
        'Preset list with preview, name, and active state.',
        [
          'Использует `.sniptale-glass-preset-list` и `.sniptale-glass-preset-item`.',
          'Активный preset выделяется через `.sniptale-glass-preset-item--active`.',
        ],
        [
          'Uses `.sniptale-glass-preset-list` and `.sniptale-glass-preset-item`.',
          'The active preset is highlighted with `.sniptale-glass-preset-item--active`.',
        ]
      ),
      variant(
        'color-trigger',
        'Color trigger',
        'Color trigger',
        'Триггер системного color picker и palette swatches для callout/background controls.',
        'Color picker trigger and palette swatches for callout and background controls.',
        [
          'Использует `.sniptale-glass-color-trigger` и `.sniptale-glass-color-option`.',
          'Disabled состояние доступно через `.sniptale-glass-color-trigger--disabled`.',
        ],
        [
          'Uses `.sniptale-glass-color-trigger` and `.sniptale-glass-color-option`.',
          'Disabled state is available through `.sniptale-glass-color-trigger--disabled`.',
        ]
      ),
      variant(
        'bold-button',
        'Bold button',
        'Bold button',
        'Компактная emphasis toggle button для text formatting actions.',
        'Compact emphasis toggle button for text formatting actions.',
        [
          'Использует `.sniptale-glass-bold-button`.',
          'Активное состояние задаётся `.sniptale-glass-bold-button--active`.',
        ],
        [
          'Uses `.sniptale-glass-bold-button`.',
          'The active state is added through `.sniptale-glass-bold-button--active`.',
        ]
      ),
      variant(
        'destructive',
        'Destructive action',
        'Destructive action',
        'Критическая destructive CTA внизу стеклянного popover.',
        'Critical destructive CTA placed at the bottom of a glass popover.',
        [
          'Использует `.sniptale-glass-destructive`.',
          'Не должна смешиваться с обычными chip/button controls в одном ряду.',
        ],
        [
          'Uses `.sniptale-glass-destructive`.',
          'Should not be mixed with ordinary chip/button controls in the same row.',
        ]
      ),
      variant(
        'option-grid',
        'Option grid',
        'Option grid',
        'Плотная grid-композиция для stacked chips и mode pickers внутри glass popover.',
        'Dense grid composition for stacked chips and mode pickers inside a glass popover.',
        [
          'Использует `.sniptale-glass-option-grid` вместе с stacked chips.',
          'Обычно сопровождается section label сверху.',
        ],
        [
          'Uses `.sniptale-glass-option-grid` together with stacked chips.',
          'Usually paired with a section label above it.',
        ]
      ),
      variant(
        'arrow-grid',
        'Arrow grid',
        'Arrow grid',
        'Трёхколоночная directional grid для anchor/side pickers.',
        'Three-column directional grid for anchor and side pickers.',
        [
          'Использует `.sniptale-glass-arrow-grid`.',
          'Центральная ячейка может содержать auto/dim marker вместо arrow icon.',
        ],
        [
          'Uses `.sniptale-glass-arrow-grid`.',
          'The center cell may contain an auto or dim marker instead of an arrow icon.',
        ]
      ),
      variant(
        'row',
        'Control row',
        'Control row',
        'Базовая row-композиция для горизонтальной раскладки контролов внутри glass popover.',
        'Base row composition for horizontally arranged controls inside a glass popover.',
        [
          'Использует `.sniptale-glass-row` и опционально `.sniptale-glass-row--spread`.',
          'Подходит для chips, mini-buttons и split control groups.',
        ],
        [
          'Uses `.sniptale-glass-row` and optionally `.sniptale-glass-row--spread`.',
          'Fits chips, mini buttons, and split control groups.',
        ]
      ),
      variant(
        'color-row',
        'Color row',
        'Color row',
        'Двухколоночная композиция для парных color controls внутри appearance sections.',
        'Two-column composition for paired color controls inside appearance sections.',
        [
          'Использует `.sniptale-glass-color-row`.',
          'Обычно содержит два `ProductGlassColorField`.',
        ],
        [
          'Uses `.sniptale-glass-color-row`.',
          'Usually contains two `ProductGlassColorField` controls.',
        ]
      ),
      variant(
        'dim-marker',
        'Dim marker',
        'Dim marker',
        'Приглушённый inline marker для auto/neutral ячеек внутри direction и state grids.',
        'Muted inline marker for auto or neutral cells inside direction and state grids.',
        [
          'Использует `.sniptale-glass-dim`.',
          'Подходит для `±`, `A` и похожих compact center markers.',
        ],
        ['Uses `.sniptale-glass-dim`.', 'Fits `±`, `A`, and similar compact center markers.']
      ),
    ],
    usageContexts: [
      usage(
        'content.step-badge.controls',
        'Контент > Step badge > Glass controls',
        'Content > Step badge > Glass controls',
        ['apps/extension/src/content/selection/step-badge-popover/index.tsx']
      ),
      usage(
        'content.callout.settings-controls',
        'Контент > Callout settings > Glass controls',
        'Content > Callout settings > Glass controls',
        ['apps/extension/src/content/selection/callout-settings-popover/index.tsx']
      ),
      usage(
        'content.frame-settings.controls',
        'Контент > Frame settings > Glass controls',
        'Content > Frame settings > Glass controls',
        ['apps/extension/src/content/selection/frame-settings-popover/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-glass-controls',
    canonicalPreview:
      'apps/extension/src/design-system/previews/product-glass-controls/design-system.tsx',
  },
];
