import type { DesignSystemRegistryEntry } from '../types';
import { usage, variant } from '../helpers';
import { SHARED_DESIGN_SYSTEM_POPUP_SHELL_INSPECTOR_REGISTRY } from './popup-shell.inspector.data.ts';

export const SHARED_DESIGN_SYSTEM_POPUP_SHELL_REGISTRY: DesignSystemRegistryEntry[] = [
  {
    componentId: 'shared.ui.popup-select',
    labelRu: 'Компактный select popup',
    labelEn: 'Compact popup select',
    kind: 'primitive',
    scope: 'shared-ui',
    source: 'apps/extension/src/ui/popup-shell/select/index.tsx',
    sourceFiles: [
      'apps/extension/src/ui/popup-shell/select/index.tsx',
      'apps/extension/src/design-system/previews/popup-shell/select/design-system.tsx',
      '@sniptale/ui/styles/popup-shell/select',
    ],
    descriptionRu:
      'Компактная popup-обёртка над ProductSelect для строк выбора с длинными значениями.',
    descriptionEn: 'Compact popup wrapper around ProductSelect for selector rows with long values.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Однострочный trigger с ellipsis и компактным scrollable menu.',
        'Single-line trigger with ellipsis and a compact scrollable menu.',
        [
          'Рендерится через `PopupSelect`.',
          'Поведение open/close, keyboard и focus restoration остаётся у `ProductSelect`.',
        ],
        [
          'Rendered with `PopupSelect`.',
          '`ProductSelect` remains the owner of open/close, keyboard, and focus restoration.',
        ]
      ),
    ],
    usageContexts: [
      usage(
        'popup.video-setup.preset-selector',
        'Popup > Подготовка видео > Выбор экрана',
        'Popup > Video setup > Screen selector',
        ['apps/extension/src/popup/recording/video/setup/options/preset-selector.tsx']
      ),
      usage(
        'popup.video-setup.microphone-selector',
        'Popup > Подготовка видео > Выбор микрофона',
        'Popup > Video setup > Microphone selector',
        ['apps/extension/src/popup/recording/video/setup/options/microphone-selector.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/ui/popup-shell/select/index.tsx',
    canonicalPreview:
      'apps/extension/src/design-system/previews/popup-shell/select/design-system.tsx',
  },
  {
    componentId: 'shared.ui.popup-action-button',
    labelRu: 'Кнопка действия popup',
    labelEn: 'Popup action button',
    kind: 'surface',
    scope: 'shared-ui',
    source: 'apps/extension/src/ui/popup-shell/action-button/index.tsx',
    sourceFiles: [
      'apps/extension/src/ui/popup-shell/action-button/index.tsx',
      'apps/extension/src/ui/popup-shell/action-button/types.ts',
      'apps/extension/src/design-system/previews/popup-shell/action-button/design-system.tsx',
      'apps/extension/src/ui/popup-shell/action-button/content.tsx',
      'apps/extension/src/ui/popup-shell/action-button/variants.tsx',
      'apps/extension/src/ui/popup-shell/action-button/styles.ts',
    ],
    descriptionRu:
      'Каноническая flat CTA-поверхность popup с крупной иконкой, спокойным idle state и компактным режимом.',
    descriptionEn:
      'Canonical flat popup CTA surface with a large icon, calm idle state, and a compact mode.',
    variants: [
      variant(
        'primary',
        'Primary',
        'Primary',
        'Главная CTA с более сильной типографикой, но без постоянной accent-tinted заливки.',
        'Primary CTA with stronger typography but no permanent accent-tinted fill.',
        [
          'Использует `tone="primary"`.',
          'Hover и focus раскрывают matte surface вместо filled card.',
        ],
        [
          'Uses `tone="primary"`.',
          'Hover and focus reveal a matte surface instead of a filled card.',
        ]
      ),
      variant(
        'secondary',
        'Secondary',
        'Secondary',
        'Нейтральная action-card рядом с primary CTA.',
        'Neutral action card adjacent to the primary CTA.',
        ['Использует `tone="secondary"`.', 'Idle state остаётся flat до hover/focus.'],
        ['Uses `tone="secondary"`.', 'The idle state remains flat until hover/focus.']
      ),
      variant(
        'gallery',
        'Gallery',
        'Gallery',
        'Более спокойный визуал для навигации в медиа-хаб и вторичные переходы.',
        'Calmer treatment for media-hub navigation and secondary routes.',
        ['Использует `tone="gallery"`.', 'Подходит для card grids без CTA-доминанты.'],
        ['Uses `tone="gallery"`.', 'Fits card grids without a CTA-dominant action.']
      ),
      variant(
        'compact',
        'Compact',
        'Compact',
        'Квадратная компактная версия для dense rows и auxiliary shortcuts.',
        'Square compact version for dense rows and auxiliary shortcuts.',
        ['Использует `compact`.', 'Label уходит в `sr-only`, визуально остаётся иконка.'],
        ['Uses `compact`.', 'The label moves to `sr-only`, leaving an icon-led surface.']
      ),
    ],
    usageContexts: [
      usage(
        'popup.home.screenshot-prep-button',
        'Popup > Главная > Подготовка страницы',
        'Popup > Home > Screenshot prep button',
        ['apps/extension/src/popup/shell/home/page-shell/sections/index.ts']
      ),
      usage(
        'popup.video-setup.start-recording-button',
        'Popup > Подготовка видео > Старт записи',
        'Popup > Video setup > Start recording button',
        ['apps/extension/src/popup/recording/video/setup/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/ui/popup-shell/action-button/index.tsx',
    canonicalPreview:
      'apps/extension/src/design-system/previews/popup-shell/action-button/design-system.tsx',
  },
  {
    componentId: 'shared.ui.popup-footer-action',
    labelRu: 'Кнопка footer popup',
    labelEn: 'Popup footer action',
    kind: 'primitive',
    scope: 'shared-ui',
    source: 'apps/extension/src/ui/popup-shell/footer/action.tsx',
    sourceFiles: [
      'apps/extension/src/ui/popup-shell/footer/action.tsx',
      'apps/extension/src/design-system/previews/popup-shell/footer/preview.tsx',
    ],
    descriptionRu:
      'Небольшой borderless matte action-контрол для popup footer с обычным и компактным режимом.',
    descriptionEn:
      'Small borderless matte utility action control for the popup footer with regular and compact modes.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Подпись остаётся рядом с иконкой и помогает сканированию footer.',
        'The label stays next to the icon and improves footer scanability.',
        ['Использует `compact={false}`.', 'Сохраняет borderless matte idle state.'],
        ['Uses `compact={false}`.', 'Keeps the borderless matte idle state.']
      ),
      variant(
        'compact',
        'Compact',
        'Compact',
        'Круглая icon-only версия для вторичных служебных действий.',
        'Circular icon-only version for secondary utility actions.',
        ['Использует `compact`.', 'Текст остаётся только в `title` и `sr-only`.'],
        ['Uses `compact`.', 'Text remains only in `title` and `sr-only`.']
      ),
    ],
    usageContexts: [
      usage(
        'popup.footer.github-button',
        'Popup > Footer > GitHub',
        'Popup > Footer > GitHub button',
        ['../../../../ui/popup-shell/footer/index.tsx']
      ),
      usage(
        'popup.footer.design-system-button',
        'Popup > Footer > Дизайн-система',
        'Popup > Footer > Design system button',
        ['../../../../ui/popup-shell/footer/index.tsx']
      ),
      usage(
        'popup.footer.settings-button',
        'Popup > Footer > Настройки',
        'Popup > Footer > Settings button',
        ['../../../../ui/popup-shell/footer/index.tsx']
      ),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/ui/popup-shell/footer/action.tsx',
    canonicalPreview: 'apps/extension/src/design-system/previews/popup-shell/footer/preview.tsx',
  },
  {
    componentId: 'shared.ui.popup-footer',
    labelRu: 'Футер popup',
    labelEn: 'Popup footer',
    kind: 'composition',
    scope: 'shared-ui',
    source: 'apps/extension/src/ui/popup-shell/footer/index.tsx',
    sourceFiles: [
      'apps/extension/src/ui/popup-shell/footer/index.tsx',
      'apps/extension/src/ui/popup-shell/footer/action.tsx',
      'apps/extension/src/design-system/previews/popup-shell/footer/preview.tsx',
    ],
    descriptionRu:
      'Собранный footer popup с номером версии и borderless matte utility actions справа.',
    descriptionEn:
      'Composed popup footer with the version label and borderless matte utility actions on the right.',
    variants: [
      variant(
        'default',
        'Default',
        'Default',
        'Базовая footer-композиция для popup entry surfaces.',
        'Default footer composition for popup entry surfaces.',
        [
          'Содержит блок версии продукта и три utility actions.',
          'Открытие design system и settings не должно дублироваться в других footer-кнопках.',
        ],
        [
          'Contains the product version block and three utility actions.',
          'Design-system and settings access should not be duplicated by other footer buttons.',
        ]
      ),
    ],
    usageContexts: [
      usage('popup.home.footer', 'Popup > Главная > Footer', 'Popup > Home > Footer', [
        'apps/extension/src/popup/shell/app/index.tsx',
      ]),
    ],
    status: 'active',
    previewFidelity: 'canonical',
    canonicalImplementation: 'apps/extension/src/ui/popup-shell/footer/index.tsx',
    canonicalPreview: 'apps/extension/src/design-system/previews/popup-shell/footer/preview.tsx',
  },
  ...SHARED_DESIGN_SYSTEM_POPUP_SHELL_INSPECTOR_REGISTRY,
];
