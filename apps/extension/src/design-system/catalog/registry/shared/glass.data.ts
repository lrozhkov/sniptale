import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const SHARED_DESIGN_SYSTEM_GLASS_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.glass-popover',
    labelRu: 'Стеклянный popover',
    labelEn: 'Glass popover',
    kind: 'primitive',
    scope: 'shared-ui',
    source: 'apps/extension/src/design-system/previews/glass-popover/index.tsx',
    sourceFiles: [
      'apps/extension/src/design-system/previews/glass-popover/index.tsx',
      'apps/extension/src/design-system/previews/glass-popover/design-system.tsx',
      'apps/extension/src/design-system/previews/glass-popover/index.tsx',
      'apps/extension/src/design-system/previews/glass-popover/design-system.tsx',
      '@sniptale/ui/styles/glass',
      '@sniptale/ui/styles/glass/popover-foundation',
      '@sniptale/ui/styles/glass/popover-controls',
      '@sniptale/ui/glass-popover/base-styles.data',
      '@sniptale/ui/glass-popover/controls-styles.data',
      '@sniptale/ui/glass-popover/styles.data',
    ],
    descriptionRu:
      'Базовая плавающая поверхность для компактных настроек, палитр и in-context контролов поверх контента.',
    descriptionEn:
      'Base floating surface for compact settings, palettes, and in-context controls on top of content.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Компактный стеклянный контейнер для небольших групп настроек.',
        'Compact glass container for smaller settings groups.',
        [
          'Ширина по умолчанию 280px.',
          'Использует `GlassPopover` без дополнительных модификаторов.',
        ],
        ['Default width is 280px.', 'Uses `GlassPopover` without extra modifiers.']
      ),
      variant(
        'wide',
        'Wide',
        'Wide',
        'Расширенная версия для более длинных списков и комбинированных контролов.',
        'Extended version for longer lists and combined controls.',
        [
          'Добавляет класс `sniptale-glass-popover--wide`.',
          'Подходит для селектов, гридов и stacked chips.',
        ],
        [
          'Adds the `sniptale-glass-popover--wide` modifier.',
          'Fits selects, grids, and stacked chips.',
        ]
      ),
      variant(
        'scroll',
        'Scroll',
        'Scroll',
        'Scrollable-контейнер для длинных наборов опций.',
        'Scrollable container for long option sets.',
        [
          'Добавляет класс `sniptale-glass-popover-scroll`.',
          'Держит контент внутри max-height вместо выталкивания layout.',
        ],
        [
          'Adds the `sniptale-glass-popover-scroll` modifier.',
          'Keeps long content inside a max-height container instead of pushing layout.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.callout-settings.popover',
        'Контент > Настройки callout > Popover',
        'Content > Callout settings > Popover',
        ['apps/extension/src/content/selection/callout-settings-popover/index.tsx']
      ),
      usage(
        'content.step-badge.popover',
        'Контент > Бейдж шага > Popover',
        'Content > Step badge > Popover',
        ['apps/extension/src/content/selection/step-badge-popover/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/design-system/previews/glass-popover/index.tsx',
    canonicalPreview: 'apps/extension/src/design-system/previews/glass-popover/design-system.tsx',
  },
  {
    componentId: 'shared.ui.glass-section',
    labelRu: 'Стеклянная секция',
    labelEn: 'Glass section',
    kind: 'primitive',
    scope: 'shared-ui',
    source: 'apps/extension/src/design-system/previews/glass-popover/index.tsx',
    sourceFiles: [
      'apps/extension/src/design-system/previews/glass-popover/index.tsx',
      'apps/extension/src/design-system/previews/glass-popover/design-system.tsx',
      'apps/extension/src/design-system/previews/glass-popover/index.tsx',
      'apps/extension/src/design-system/previews/glass-popover/design-system.tsx',
      '@sniptale/ui/styles/glass',
      '@sniptale/ui/styles/glass/popover-foundation',
      '@sniptale/ui/glass-popover/base-styles.data',
    ],
    descriptionRu:
      'Подсекция внутри стеклянного popover с заголовком, внутренним padding и контрастным фоном.',
    descriptionEn:
      'Inset section inside a glass popover with title, internal padding, and elevated contrast.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Базовый блок для одного логического кластера настроек.',
        'Base block for one logical settings cluster.',
        ['Рендерится через `GlassSection`.', 'Заголовок опционален, но spacing остаётся тем же.'],
        ['Rendered with `GlassSection`.', 'The title is optional while spacing remains the same.']
      ),
    ],
    usageContexts: [
      usage(
        'content.callout-settings.section',
        'Контент > Настройки callout > Секция',
        'Content > Callout settings > Section',
        ['apps/extension/src/content/selection/callout-settings-popover/index.tsx']
      ),
      usage(
        'content.step-badge.section',
        'Контент > Бейдж шага > Секция',
        'Content > Step badge > Section',
        ['apps/extension/src/content/selection/step-badge-popover/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/design-system/previews/glass-popover/index.tsx',
    canonicalPreview: 'apps/extension/src/design-system/previews/glass-popover/design-system.tsx',
  },
  {
    componentId: 'shared.ui.glass-select',
    labelRu: 'Стеклянный select',
    labelEn: 'Glass select',
    kind: 'primitive',
    scope: 'shared-ui',
    source: 'apps/extension/src/ui/glass-select/index.tsx',
    sourceFiles: [
      'apps/extension/src/ui/glass-select/index.tsx',
      '@sniptale/ui/glass-select/types',
      'apps/extension/src/design-system/previews/glass-select/design-system.tsx',
      'apps/extension/src/ui/glass-select/index.tsx',
      'apps/extension/src/ui/glass-select/content.tsx',
      'apps/extension/src/ui/glass-select/menu.tsx',
      'apps/extension/src/ui/glass-select/menu-surface.tsx',
      '@sniptale/ui/glass-select/option',
      'apps/extension/src/ui/glass-select/overlay.tsx',
      '@sniptale/ui/glass-select/trigger',
      '@sniptale/ui/glass-select/styles',
      '@sniptale/ui/glass-select/types',
      'apps/extension/src/ui/glass-select/controller.ts',
      '@sniptale/ui/glass-select/dismiss',
      '@sniptale/ui/glass-select/layout',
      '@sniptale/ui/glass-select/overlay-state',
    ],
    descriptionRu:
      'Общий dropdown-контрол для popup, settings и других поверхностей с отдельными режимами визуала и меню.',
    descriptionEn:
      'Shared dropdown control for popup, settings, and other surfaces with distinct trigger and menu modes.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Базовый select для form surfaces и нейтральных панелей.',
        'Base select for form surfaces and neutral panels.',
        ['Использует `variant="default"`.', 'Поддерживает описания option и icons.'],
        ['Uses `variant="default"`.', 'Supports option descriptions and icons.']
      ),
      variant(
        'popup-flat',
        'Popup flat',
        'Popup flat',
        'Уплощённый trigger под popup/action-surfaces без heavy chrome.',
        'Flattened trigger for popup/action surfaces without heavy chrome.',
        ['Использует `variant="popup-flat"`.', 'Меню остаётся glass, trigger заметно компактнее.'],
        [
          'Uses `variant="popup-flat"`.',
          'The menu remains glass while the trigger becomes flatter.',
        ]
      ),
      variant(
        'portal',
        'Portal',
        'Portal',
        'Меню выносится в theme-safe owning root, включая shadow root или верхний surface root.',
        'Menu renders into the theme-safe owning root, including a shadow root or top surface root.',
        ['Использует `portal={true}`.', 'Нужен для плавающих меню над clipping-контейнерами.'],
        ['Uses `portal={true}`.', 'Needed for floating menus above clipping containers.']
      ),
      variant(
        'sm',
        'Small',
        'Small',
        'Компактная плотность для узких popup-панелей и stacked settings.',
        'Compact density for narrow popup panels and stacked settings.',
        ['Использует `size="sm"`.', 'Снижает padding и размер option rows.'],
        ['Uses `size="sm"`.', 'Reduces padding and option row height.']
      ),
      variant(
        'md',
        'Medium',
        'Medium',
        'Основная плотность для form rows и normal-width panels.',
        'Default density for form rows and normal-width panels.',
        ['Использует `size="md"`.', 'Базовый размер без дополнительных модификаторов.'],
        ['Uses `size="md"`.', 'Default size without extra modifiers.']
      ),
    ],
    usageContexts: [
      usage(
        'settings.appearance.theme-select',
        'Настройки > Внешний вид > Выбор темы',
        'Settings > Appearance > Theme select',
        ['apps/extension/src/settings/sections/appearance/index.tsx']
      ),
      usage(
        'popup.video-setup.quality-select',
        'Popup > Подготовка видео > Выбор качества',
        'Popup > Video setup > Quality select',
        ['apps/extension/src/popup/recording/video/setup/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/ui/glass-select/index.tsx',
    canonicalPreview: 'apps/extension/src/design-system/previews/glass-select/design-system.tsx',
  },
];
