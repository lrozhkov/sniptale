import type { DesignSystemRegistryEntry } from '../../types';
import { usage, variant } from '../../helpers';

export const PRODUCT_DESIGN_SYSTEM_MENU_SURFACES_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'product.ui.dropdown-menu',
    labelRu: 'Dropdown menu',
    labelEn: 'Dropdown menu',
    kind: 'surface',
    scope: 'product-ui',
    source: '@sniptale/ui/product-menus/dropdown',
    sourceFiles: [
      '@sniptale/ui/product-menus/dropdown',
      'apps/extension/src/design-system/previews/product-menus/dropdown/design-system.tsx',
      '@sniptale/ui/styles/ai-modal-content',
      '@sniptale/ui/styles/overlays',
      '@sniptale/ui/styles/overlays/menu-surfaces',
    ],
    descriptionRu:
      'Общий matte-neutral dropdown/menu паттерн для template menus, AI model lists и destructive item flows.',
    descriptionEn:
      'Shared matte-neutral dropdown/menu pattern for template menus, AI model lists, and destructive item flows.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Базовый overlay-список действий и опций.',
        'Base overlay list for actions and options.',
        [
          'Использует `.sniptale-dropdown-menu` и `.sniptale-dropdown-item`.',
          'Поддерживает inline icons и двухстрочный copy.',
          'Idle rows остаются flat, surface появляется на hover и selected state.',
        ],
        [
          'Uses `.sniptale-dropdown-menu` and `.sniptale-dropdown-item`.',
          'Supports inline icons and two-line copy.',
          'Idle rows stay flat, with the surface appearing on hover and selected state.',
        ]
      ),
      variant(
        'template',
        'Template menu',
        'Template menu',
        'Dropdown, встроенный в template pill и управляющий карточкой шаблона.',
        'Dropdown embedded into a template pill that manages a template card.',
        [
          'Использует `.sniptale-template-dropdown` поверх общего menu contract.',
          'Обычно якорится к `.sniptale-template-menu-btn`.',
        ],
        [
          'Uses `.sniptale-template-dropdown` on top of the common menu contract.',
          'Usually anchored to `.sniptale-template-menu-btn`.',
        ]
      ),
      variant(
        'danger',
        'Danger item',
        'Danger item',
        'Destructive row внутри меню для удаления и необратимых действий.',
        'Destructive row inside the menu for deletion and irreversible actions.',
        [
          'Использует `.sniptale-dropdown-item.danger`.',
          'Должен применяться только к terminal destructive action в конце списка.',
        ],
        [
          'Uses `.sniptale-dropdown-item.danger`.',
          'Should be reserved for the terminal destructive action at the end of the list.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.ai.model-menu',
        'Контент > AI modal > Выбор модели',
        'Content > AI modal > Model menu',
        ['apps/extension/src/content/overlay/ai/modal/shell/model-selector.tsx']
      ),
      usage(
        'content.template-list.dropdown',
        'Контент > Template list > Dropdown menu',
        'Content > Template list > Dropdown menu',
        ['apps/extension/src/content/overlay/ai/template-list/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-menus/dropdown',
    canonicalPreview:
      'apps/extension/src/design-system/previews/product-menus/dropdown/design-system.tsx',
  },
  {
    componentId: 'product.ui.toolbar-menu',
    labelRu: 'Toolbar menu',
    labelEn: 'Toolbar menu',
    kind: 'surface',
    scope: 'product-ui',
    source: '@sniptale/ui/product-menus/toolbar',
    sourceFiles: [
      '@sniptale/ui/product-menus/toolbar',
      'apps/extension/src/design-system/previews/product-menus/toolbar/design-system.tsx',
      '@sniptale/ui/styles/toolbar',
      '@sniptale/ui/styles/toolbar/transient/root',
      '@sniptale/ui/styles/toolbar/menu-surface',
      '@sniptale/ui/styles/toolbar/menu-items',
      '@sniptale/ui/styles/toolbar/menu-status',
      '@sniptale/ui/styles/toolbar/transient/menus',
      '@sniptale/ui/styles/overlays/menu-surfaces',
    ],
    descriptionRu:
      'Плавающее matte-neutral меню из toolbar для viewport, capture-режимов и списков быстрых переключений.',
    descriptionEn:
      'Matte-neutral floating toolbar menu for viewport, capture modes, and quick-switch lists.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Базовый popover menu со списком selectable rows.',
        'Base popover menu with selectable rows.',
        [
          'Использует `.sniptale-popover-menu` и `.sniptale-popover-item`.',
          'Заголовок оформляется через `.sniptale-toolbar-menu-title`.',
          'Idle rows остаются flat до hover.',
        ],
        [
          'Uses `.sniptale-popover-menu` and `.sniptale-popover-item`.',
          'The heading uses `.sniptale-toolbar-menu-title`.',
          'Idle rows stay flat until hover.',
        ]
      ),
      variant(
        'compact',
        'Compact',
        'Compact',
        'Уплотнённая версия для узких вспомогательных меню toolbar.',
        'Denser version for narrower auxiliary toolbar menus.',
        [
          'Использует модификатор `.sniptale-toolbar-menu--compact`.',
          'Применяется к спискам с короткими подписями.',
        ],
        [
          'Uses the `.sniptale-toolbar-menu--compact` modifier.',
          'Applied to menus with short labels.',
        ]
      ),
      variant(
        'selected',
        'Selected row',
        'Selected row',
        'Активный выбранный item с badge/check и усиленным контрастом.',
        'Active selected item with badge/check and elevated contrast.',
        [
          'Использует `.sniptale-popover-item-selected`.',
          'Подсказки размеров и secondary text переключаются вместе с selected state.',
          'Selected state опирается на matte surface и selected border, а не на accent wash.',
        ],
        [
          'Uses `.sniptale-popover-item-selected`.',
          'Size hints and secondary text switch with the selected state.',
          'The selected state relies on a matte surface and selected border instead of an accent wash.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'content.viewport.menu',
        'Контент > Viewport selector > Меню',
        'Content > Viewport selector > Menu',
        ['apps/extension/src/content/overlay/viewport-selector/index.tsx']
      ),
      usage(
        'content.toolbar.capture-menu',
        'Контент > Toolbar > Capture actions menu',
        'Content > Toolbar > Capture actions menu',
        ['apps/extension/src/content/overlay/toolbar/capture/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-menus/toolbar',
    canonicalPreview:
      'apps/extension/src/design-system/previews/product-menus/toolbar/design-system.tsx',
  },
];
