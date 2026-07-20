import { defineMessageSource } from '../../source';

export const designSystemPagePreviewMessages = defineMessageSource({
  technicalDetailsTitle: {
    ru: 'Техническое описание',
    en: 'Technical details',
  },
  sourceFilesTitle: {
    ru: 'Source files',
    en: 'Source files',
  },
  previewControlsTitle: {
    ru: 'Preview controls',
    en: 'Preview controls',
  },
  activeChip: {
    ru: 'Активно',
    en: 'Active',
  },
  passiveChip: {
    ru: 'Пассивно',
    en: 'Passive',
  },
  selectPreviewTitle: {
    ru: 'Select preview',
    en: 'Select preview',
  },
  selectAriaLabel: {
    ru: 'Preview select design-system page',
    en: 'Design system preview select',
  },
  primaryActionLabel: {
    ru: 'Primary CTA',
    en: 'Primary CTA',
  },
  primaryActionSubtitle: {
    ru: 'Shared surface',
    en: 'Shared surface',
  },
  compactCardLabel: {
    ru: 'Compact card',
    en: 'Compact card',
  },
  inspectorShellTitle: {
    ru: 'Inspector shell',
    en: 'Inspector shell',
  },
  inspectorShellSubtitle: {
    ru: 'Общий chrome для editor и video-editor',
    en: 'Editor and video-editor shared chrome',
  },
  collapsePreviewTitle: {
    ru: 'Свернуть preview',
    en: 'Collapse preview',
  },
  inspectorShellBody: {
    ru: 'Общая shell-композиция для inspector family и свёрнутых sidebar rails.',
    en: 'Shared shell composition for inspector families and collapsed sidebar rails.',
  },
  previewModeTitle: {
    ru: 'Preview mode',
    en: 'Preview mode',
  },
  defaultSelect: {
    ru: 'Default select',
    en: 'Default select',
  },
  popupFlat: {
    ru: 'Popup flat',
    en: 'Popup flat',
  },
  glassPopoverPreviewTitle: {
    ru: 'Плавающая группа настроек',
    en: 'Floating settings group',
  },
  glassPopoverPreviewDescription: {
    ru: 'Показывает стеклянный контейнер и секции так, как они выглядят в настройках поверх контента.',
    en: 'Shows the glass container and sections the way they appear in content-adjacent settings.',
  },
  popupActionPreviewTitle: {
    ru: 'Карточка действия в popup',
    en: 'Popup action card',
  },
  popupActionPreviewDescription: {
    ru: 'Сравнение крупной CTA-кнопки и компактного варианта в одном визуальном блоке.',
    en: 'Compares the large CTA button and the compact variant in one visual block.',
  },
  popupFooterPreviewTitle: {
    ru: 'Нижняя служебная панель',
    en: 'Bottom utility bar',
  },
  popupFooterPreviewDescription: {
    ru: 'Композиция футера с бренд-блоком и служебными экшенами рядом.',
    en: 'Footer composition with the product brand block and adjacent utility actions.',
  },
  inspectorPreviewTitle: {
    ru: 'Инспекторный sidebar chrome',
    en: 'Inspector sidebar chrome',
  },
  inspectorPreviewDescription: {
    ru: 'Каркас для editor/video-editor: header action, shell panel и рабочая поверхность внутри.',
    en: 'Shell for editor/video-editor surfaces: header action, panel chrome, and working area inside.',
  },
  compactInspectorPreviewSceneTitle: {
    ru: 'Название сцены',
    en: 'Scene title',
  },
  compactInspectorPreviewTheme: {
    ru: 'Тема',
    en: 'Theme',
  },
  compactInspectorPreviewThemeLight: {
    ru: 'Светлая',
    en: 'Light',
  },
  compactInspectorPreviewThemeDark: {
    ru: 'Темная',
    en: 'Dark',
  },
  compactInspectorPreviewTitleLabel: {
    ru: 'Название',
    en: 'Title',
  },
  compactInspectorPreviewStyleLabel: {
    ru: 'Стиль',
    en: 'Style',
  },
  compactInspectorPreviewSolid: {
    ru: 'Сплошная',
    en: 'Solid',
  },
  compactInspectorPreviewDash: {
    ru: 'Пунктир',
    en: 'Dashed',
  },
  compactInspectorPreviewScale: {
    ru: 'Масштаб',
    en: 'Scale',
  },
  compactInspectorPreviewInputAndSelection: {
    ru: 'ВВОД И ВЫБОР',
    en: 'INPUT AND SELECTION',
  },
  compactInspectorPreviewSize: {
    ru: 'Размер',
    en: 'Size',
  },
  compactInspectorPreviewOpacity: {
    ru: 'Прозрачность',
    en: 'Opacity',
  },
  compactInspectorPreviewDynamicWidth: {
    ru: 'Динамическая толщина',
    en: 'Dynamic width',
  },
  compactInspectorPreviewSmoothing: {
    ru: 'Сглаживание',
    en: 'Smoothing',
  },
  compactInspectorPreviewStabilization: {
    ru: 'Стабилизация',
    en: 'Stabilization',
  },
  compactInspectorPreviewUnavailable: {
    ru: 'Недоступно',
    en: 'Unavailable',
  },
  compactInspectorPreviewLineSection: {
    ru: 'ЛИНИЯ',
    en: 'LINE',
  },
  compactInspectorPreviewStrokeWidth: {
    ru: 'Толщина',
    en: 'Stroke width',
  },
  compactInspectorPreviewStrokeColorSection: {
    ru: 'ЦВЕТ ОБВОДКИ',
    en: 'STROKE COLOR',
  },
  compactInspectorPreviewStrokeColor: {
    ru: 'Цвет обводки',
    en: 'Stroke color',
  },
  compactInspectorPreviewEmptyTemplates: {
    ru: 'Нет доступных шаблонов',
    en: 'No templates available',
  },
  compactInspectorPreviewSystemGroup: {
    ru: 'СИСТЕМНЫЕ',
    en: 'SYSTEM',
  },
  compactInspectorPreviewThinLine: {
    ru: 'Тонкая линия',
    en: 'Thin line',
  },
  compactInspectorPreviewUserGroup: {
    ru: 'ПОЛЬЗОВАТЕЛЬСКИЕ',
    en: 'USER',
  },
  compactInspectorPreviewAccent: {
    ru: 'Акцент',
    en: 'Accent',
  },
  compactInspectorPreviewWarmAccent: {
    ru: 'Теплый акцент',
    en: 'Warm accent',
  },
  compactInspectorPreviewDeepBlue: {
    ru: 'Глубокий синий',
    en: 'Deep blue',
  },
});
