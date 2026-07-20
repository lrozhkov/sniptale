import { defineMessageSource } from '../source';

const APPEARANCE_DESCRIPTION_RU = [
  'Управляет общей темой интерфейса расширения, активным языком и встраиванием Sniptale в контекстное меню браузера.',
  'Изменения применяются сразу в текущем окне и в других открытых страницах расширения.',
].join(' ');

const APPEARANCE_DESCRIPTION_EN = [
  'Controls the shared extension UI theme, active language, and Sniptale browser context menu integration.',
  'Changes apply immediately in the current window and other open extension pages.',
].join(' ');
const AUTHENTICATED_SNAPSHOT_ASSETS_DESCRIPTION_RU = [
  'Опционально сохранять изображения и стили с того же сайта с учётом текущего входа.',
  'По умолчанию такие ресурсы пропускаются при сохранении веб-снимка.',
].join(' ');
const AUTHENTICATED_SNAPSHOT_ASSETS_DESCRIPTION_EN = [
  'Optionally save same-site images and styles using the current signed-in session.',
  'By default, those assets are skipped while saving a web snapshot.',
].join(' ');
const AUTHENTICATED_SNAPSHOT_ASSETS_WARNING_RU = [
  'Включение может добавить в сохранённый файл приватные ресурсы текущего сайта.',
  'Используйте только для снимков, которые не будут переданы третьим лицам.',
].join(' ');
const AUTHENTICATED_SNAPSHOT_ASSETS_WARNING_EN = [
  'Enabling this can embed private resources from the current site into the saved file.',
  'Use it only for snapshots that will not be shared externally.',
].join(' ');
const ANONYMOUS_CROSS_ORIGIN_SNAPSHOT_ASSETS_DESCRIPTION_RU = [
  'Анонимно загружать HTTPS-ресурсы с других сайтов через фон расширения.',
  'Если выключено, внешние ресурсы пропускаются; это снижает риск private-network и DNS-rebinding утечек.',
].join(' ');
const ANONYMOUS_CROSS_ORIGIN_SNAPSHOT_ASSETS_DESCRIPTION_EN = [
  'Anonymously load HTTPS assets from other sites through the extension background.',
  'When disabled, external assets are skipped; this reduces private-network and DNS-rebinding leak risk.',
].join(' ');
const RAW_DIAGNOSTICS_DESCRIPTION_RU = [
  'Для HAR расширенный режим выдаётся только на время конкретного экспорта.',
  'Логи экспорта могут содержать сетевые детали,',
  'но cookies, authorization headers и чувствительные URL-параметры всегда редактируются.',
].join(' ');
const RAW_DIAGNOSTICS_DESCRIPTION_EN = [
  'Extended HAR mode is scoped to the current export only.',
  'Export logs may include network details,',
  'but cookies, authorization headers, and sensitive URL parameters are always redacted.',
].join(' ');

export const settingsAppearanceMessages = defineMessageSource({
  badge: {
    ru: 'Интерфейс',
    en: 'Interface',
  },
  title: {
    ru: 'Интерфейс',
    en: 'Interface',
  },
  description: {
    ru: APPEARANCE_DESCRIPTION_RU,
    en: APPEARANCE_DESCRIPTION_EN,
  },
  themePreferenceLabel: {
    ru: 'Тема',
    en: 'Theme',
  },
  languagePreferenceLabel: {
    ru: 'Язык',
    en: 'Language',
  },
  systemOption: {
    ru: 'Системная',
    en: 'System',
  },
  systemDescription: {
    ru: 'Следовать системной теме',
    en: 'Follow the system theme',
  },
  lightOption: {
    ru: 'Светлая',
    en: 'Light',
  },
  lightDescription: {
    ru: 'Светлая палитра интерфейса',
    en: 'Light interface palette',
  },
  darkOption: {
    ru: 'Тёмная',
    en: 'Dark',
  },
  darkDescription: {
    ru: 'Тёмная палитра интерфейса',
    en: 'Dark interface palette',
  },
  themeSelectAriaLabel: {
    ru: 'Предпочтение темы',
    en: 'Theme preference',
  },
  languageSelectAriaLabel: {
    ru: 'Предпочтение языка',
    en: 'Language preference',
  },
  themeModeLabel: {
    ru: 'Режим темы',
    en: 'Theme mode',
  },
  themeModeHint: {
    ru: 'Выберите, как должна выглядеть страница настроек и другие окна расширения.',
    en: 'Choose a theme mode. The system option follows the device appearance automatically.',
  },
  followSystemCompactHint: {
    ru: 'Автоматически подстраивать тему под настройки устройства.',
    en: 'Automatically match the device appearance setting.',
  },
  capturePrivacyTitle: {
    ru: 'Веб-снимки',
    en: 'Web snapshots',
  },
  authenticatedSnapshotAssetsLabel: {
    ru: 'Загружать ресурсы текущего сайта',
    en: 'Load current-site assets',
  },
  authenticatedSnapshotAssetsDescription: {
    ru: AUTHENTICATED_SNAPSHOT_ASSETS_DESCRIPTION_RU,
    en: AUTHENTICATED_SNAPSHOT_ASSETS_DESCRIPTION_EN,
  },
  authenticatedSnapshotAssetsWarning: {
    ru: AUTHENTICATED_SNAPSHOT_ASSETS_WARNING_RU,
    en: AUTHENTICATED_SNAPSHOT_ASSETS_WARNING_EN,
  },
  anonymousCrossOriginSnapshotAssetsLabel: {
    ru: 'Загружать внешние ресурсы',
    en: 'Load external assets',
  },
  anonymousCrossOriginSnapshotAssetsDescription: {
    ru: ANONYMOUS_CROSS_ORIGIN_SNAPSHOT_ASSETS_DESCRIPTION_RU,
    en: ANONYMOUS_CROSS_ORIGIN_SNAPSHOT_ASSETS_DESCRIPTION_EN,
  },
  rawDiagnosticsLabel: {
    ru: 'Сохранять расширенную диагностику',
    en: 'Save extended diagnostics',
  },
  rawDiagnosticsDescription: {
    ru: RAW_DIAGNOSTICS_DESCRIPTION_RU,
    en: RAW_DIAGNOSTICS_DESCRIPTION_EN,
  },
  contextMenuTitle: {
    ru: 'Встраивание в контекстное меню',
    en: 'Browser context menu integration',
  },
  contextMenuDescription: {
    ru: 'Управляет тем, какие разделы и страницы Sniptale доступны из контекстного меню браузера.',
    en: 'Controls which Sniptale sections and pages are available from the browser context menu.',
  },
  contextMenuEnabledLabel: {
    ru: 'Встраивание в контекстное меню',
    en: 'Enable context menu integration',
  },
  contextMenuEnabledDescription: {
    ru: 'Добавить корневое меню Sniptale в контекстное меню браузера.',
    en: 'Add the Sniptale root item to the browser context menu.',
  },
  contextMenuVisibleItemsLabel: {
    ru: 'Показывать пункты',
    en: 'Visible items',
  },
  contextMenuScreenshotsLabel: {
    ru: 'Снимки',
    en: 'Screenshots',
  },
  contextMenuScreenshotsDescription: {
    ru: 'Подготовка страницы и быстрые действия.',
    en: 'Page preparation and quick actions.',
  },
  contextMenuVideoLabel: {
    ru: 'Видео',
    en: 'Video',
  },
  contextMenuVideoDescription: {
    ru: 'Запись вкладки, области, пресета и окна.',
    en: 'Tab, area, preset, and window recording.',
  },
  contextMenuExportLabel: {
    ru: 'Экспорт',
    en: 'Export',
  },
  contextMenuExportDescription: {
    ru: 'Экспорт страницы и копирование JSON/Markdown.',
    en: 'Page export plus JSON/Markdown copy actions.',
  },
  contextMenuImageEditorLabel: {
    ru: 'Редактор изображений',
    en: 'Image editor',
  },
  contextMenuImageEditorDescription: {
    ru: 'Открывать встроенный редактор изображений.',
    en: 'Open the built-in image editor.',
  },
  contextMenuVideoEditorLabel: {
    ru: 'Видео редактор',
    en: 'Video editor',
  },
  contextMenuVideoEditorDescription: {
    ru: 'Открывать отдельную страницу видео-редактора.',
    en: 'Open the standalone video editor page.',
  },
  contextMenuGalleryLabel: {
    ru: 'Галерея',
    en: 'Gallery',
  },
  contextMenuGalleryDescription: {
    ru: 'Открывать библиотеку сохранённых файлов и проектов.',
    en: 'Open the saved files and projects library.',
  },
  contextMenuPageLinkCopyLabel: {
    ru: 'Копировать название и ссылку',
    en: 'Copy title and link',
  },
  contextMenuPageLinkCopyDescription: {
    ru: 'Показывать форматы копирования названия страницы и ссылки.',
    en: 'Show title and page link copy formats.',
  },
  contextMenuSettingsLabel: {
    ru: 'Настройки',
    en: 'Settings',
  },
  contextMenuSettingsDescription: {
    ru: 'Открывать страницу настроек из нижнего пункта меню.',
    en: 'Open the settings page from the bottom menu item.',
  },
});
