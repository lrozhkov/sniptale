import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';

export const PRODUCT_DESIGN_SYSTEM_FORM_CONTROLS_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'product.ui.form-controls',
    labelRu: 'Form controls',
    labelEn: 'Form controls',
    kind: 'primitive',
    scope: 'product-ui',
    source: '@sniptale/ui/product-form-controls',
    sourceFiles: [
      '@sniptale/ui/product-form-controls',
      'apps/extension/src/design-system/previews/product-form-controls/design-system.tsx',
      '@sniptale/ui/product-form-controls',
      'apps/extension/src/design-system/previews/product-form-controls/design-system.tsx',
      '@sniptale/ui/styles/ai-modal-content',
      '@sniptale/ui/styles/overlays',
    ],
    descriptionRu: [
      'Единая визуальная система для input, textarea, checkbox',
      'и вспомогательных keyboard-hints в модальных и form flows.',
    ].join(' '),
    descriptionEn:
      'Unified visual system for input, textarea, checkbox, and keyboard hints across modal and form flows.',
    variants: [
      variant(
        'input',
        'Input',
        'Input',
        'Однострочный field для URL, ключей, имён и кодов.',
        'Single-line field for URLs, keys, names, and codes.',
        [
          'Использует `.sniptale-input`.',
          'Ошибки показываются через `.sniptale-input-error` и `.sniptale-error-text`.',
        ],
        [
          'Uses `.sniptale-input`.',
          'Errors are shown with `.sniptale-input-error` and `.sniptale-error-text`.',
        ]
      ),
      variant(
        'textarea',
        'Textarea',
        'Textarea',
        'Многострочное поле для промптов, CSS и длинных описаний.',
        'Multi-line field for prompts, CSS, and long descriptions.',
        [
          'Использует `.sniptale-textarea`.',
          'Поддерживает общий scrollbar contract через `.sniptale-modal-scroll`.',
        ],
        [
          'Uses `.sniptale-textarea`.',
          'Shares the scrollable contract with `.sniptale-modal-scroll`.',
        ]
      ),
      variant(
        'checkbox',
        'Checkbox',
        'Checkbox',
        'Флаг-переключатель для булевых настроек и списков опций.',
        'Boolean toggle for settings and option lists.',
        [
          'Использует `.sniptale-checkbox` и `.sniptale-checkbox-sm`.',
          'Нужно оборачивать в кликабельный row для нормальной hit area.',
        ],
        [
          'Uses `.sniptale-checkbox` and `.sniptale-checkbox-sm`.',
          'Should be wrapped in a clickable row to provide a usable hit area.',
        ]
      ),
      variant(
        'select',
        'Select',
        'Select',
        'Matte select для full-page forms и panel-based runtime settings.',
        'Matte select for full-page forms and panel-based runtime settings.',
        ['Использует `.sniptale-select`.', 'Заменяет glass-style select на full-page surfaces.'],
        ['Uses `.sniptale-select`.', 'Replaces glass-style selects on full-page surfaces.']
      ),
      variant(
        'toggle',
        'Toggle',
        'Toggle',
        'Matte boolean control для settings rows и compact form actions.',
        'Matte boolean control for settings rows and compact form actions.',
        [
          'Использует `.sniptale-product-toggle`.',
          'Предназначен для list/form rows, а не для floating glass surfaces.',
        ],
        [
          'Uses `.sniptale-product-toggle`.',
          'Intended for list and form rows, not floating glass surfaces.',
        ]
      ),
      variant(
        'range',
        'Range',
        'Range',
        'Matte slider для controlled intensity, quality и numeric panel settings.',
        'Matte slider for controlled intensity, quality, and numeric panel settings.',
        [
          'Использует `.sniptale-range`.',
          'Сохраняет full-page matte treatment без glass chroming.',
        ],
        ['Uses `.sniptale-range`.', 'Keeps the full-page matte treatment without glass chrome.']
      ),
      variant(
        'kbd',
        'Keyboard hint',
        'Keyboard hint',
        'Небольшой inline-хинт для горячих клавиш и shortcut-подсказок.',
        'Small inline hint for hotkeys and shortcut labels.',
        ['Использует `.sniptale-kbd`.', 'Не должен выступать самостоятельной CTA.'],
        ['Uses `.sniptale-kbd`.', 'Should not be used as a standalone CTA.']
      ),
    ],
    usageContexts: [
      usage(
        'content.ai.prompt-field',
        'Контент > AI modal > Поля формы',
        'Content > AI modal > Form fields',
        ['apps/extension/src/content/overlay/ai/modal/shell/index.tsx']
      ),
      usage(
        'settings.providers.forms',
        'Настройки > AI providers > Формы',
        'Settings > AI providers > Forms',
        ['apps/extension/src/settings/sections/ai-providers/surface/modals.tsx']
      ),
      usage(
        'content.save-dialog.checkbox-row',
        'Контент > Save dialog > Checkbox row',
        'Content > Save dialog > Checkbox row',
        ['apps/extension/src/content/overlay/save-dialog-modal/index.tsx']
      ),
      usage(
        'content.template-editor.fields',
        'Контент > Template editor > Fields',
        'Content > Template editor > Fields',
        ['../../../../features/prompt-templates/editor/index.tsx']
      ),
      usage(
        'settings.viewport.fields',
        'Настройки > Viewport preset editor > Fields',
        'Settings > Viewport preset editor > Fields',
        ['apps/extension/src/settings/sections/viewport-presets/editor/index.tsx']
      ),
      usage(
        'settings.page.controls',
        'Настройки > Page surface > Select / toggle / range controls',
        'Settings > Page surface > Select / toggle / range controls',
        ['apps/extension/src/settings/section-surface/panel-controls.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: '@sniptale/ui/product-form-controls',
    canonicalPreview:
      'apps/extension/src/design-system/previews/product-form-controls/design-system.tsx',
  },
];
