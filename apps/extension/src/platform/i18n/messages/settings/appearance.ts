import { defineMessageSource } from '../source';

const APPEARANCE_DESCRIPTION_RU = [
  'Управляет общей темой интерфейса расширения, активным языком и встраиванием Sniptale в контекстное меню браузера.',
  'Изменения применяются сразу в текущем окне и в других открытых страницах расширения.',
].join(' ');

const APPEARANCE_DESCRIPTION_EN = [
  'Controls the shared extension UI theme, active language, and Sniptale browser context menu integration.',
  'Changes apply immediately in the current window and other open extension pages.',
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
  popupStartupLabel: {
    ru: 'Стартовый экран',
    en: 'Start screen',
  },
  popupStartupAriaLabel: {
    ru: 'Что показывать при открытии основного меню',
    en: 'What to show when opening the main menu',
  },
  keyboardShortcutsLabel: {
    ru: 'Горячие клавиши',
    en: 'Keyboard shortcuts',
  },
  keyboardShortcutsDescription: {
    ru: 'Назначайте системные сочетания для снимков, инструментов, экспорта и редакторов.',
    en: 'Assign system shortcuts for screenshots, tools, export, and editors.',
  },
  keyboardShortcutsButton: {
    ru: 'Настроить в Chrome',
    en: 'Configure in Chrome',
  },
  popupStartupOptions: {
    'remember-last': {
      ru: 'Продолжить с последнего места',
      en: 'Continue where I left off',
    },
    menu: { ru: 'Меню', en: 'Menu' },
    'screenshots:quick-actions': { ru: 'Снимки — Действия', en: 'Screenshots — Shortcuts' },
    'screenshots:tab': { ru: 'Снимки — Вкладка', en: 'Screenshots — Tab' },
    'screenshots:desktop': { ru: 'Снимки — Окно', en: 'Screenshots — Window' },
    'video:tab': { ru: 'Видео — Вкладка', en: 'Video — Tab' },
    'video:camera': { ru: 'Видео — Камера', en: 'Video — Camera' },
    'video:screen': { ru: 'Видео — Окно или экран', en: 'Video — Window or screen' },
    tools: { ru: 'Инструменты', en: 'Tools' },
    'export:download': { ru: 'Экспорт — Скачать', en: 'Export — Download' },
    'export:library': { ru: 'Экспорт — В библиотеку', en: 'Export — To Library' },
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
  contextMenuTitle: {
    ru: 'Контекстное меню браузера',
    en: 'Browser context menu',
  },
  contextMenuDescription: {
    ru: 'Управляет тем, какие разделы и страницы Sniptale доступны из контекстного меню браузера.',
    en: 'Controls which Sniptale sections and pages are available from the browser context menu.',
  },
  contextMenuEnabledLabel: {
    ru: 'Показывать меню Sniptale',
    en: 'Show the Sniptale menu',
  },
  contextMenuEnabledDescription: {
    ru: 'Добавить корневое меню Sniptale в контекстное меню браузера.',
    en: 'Add the Sniptale root item to the browser context menu.',
  },
  contextMenuVisibleItemsLabel: {
    ru: 'Команды в меню',
    en: 'Menu commands',
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
    ru: 'Запись вкладки, области, шаблона и окна.',
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
    ru: 'Библиотека',
    en: 'Library',
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
  contextMenuWindowResizeLabel: {
    ru: 'Размер окна',
    en: 'Window size',
  },
  contextMenuWindowResizeMenuLabel: {
    ru: 'Изменить размер окна',
    en: 'Resize window',
  },
  contextMenuWindowResizeDescription: {
    ru: 'Менять размер окна по включённым шаблонам.',
    en: 'Resize the window using enabled presets.',
  },
  contextMenuSettingsLabel: {
    ru: 'Настройки',
    en: 'Settings',
  },
  contextMenuSettingsDescription: {
    ru: 'Открывать страницу настроек из нижнего пункта меню.',
    en: 'Open the settings page from the bottom menu item.',
  },
  contextMenuCustomize: { ru: 'Настроить разделы и порядок', en: 'Customize sections and order' },
  contextMenuRoot: { ru: 'Основное меню', en: 'Main menu' },
  contextMenuEditorHelp: {
    ru: 'Включайте блоки, перемещайте их между разделами и меняйте порядок стрелками. Подкоманды остаются внутри блоков. Быстрые действия снимков и шаблоны размеров окна настраиваются в своих разделах. Пустые разделы не показываются в меню.',
    en: 'Enable blocks, move them between sections, and reorder them with the arrow buttons. Subcommands stay inside their blocks. Screenshot quick actions and window size presets are managed in their own settings. Empty sections are omitted from the menu.',
  },
  contextMenuSectionName: { ru: 'Название раздела', en: 'Section name' },
  contextMenuSection: { ru: 'Раздел', en: 'Section' },
  contextMenuUp: { ru: 'Выше', en: 'Move up' },
  contextMenuDown: { ru: 'Ниже', en: 'Move down' },
  contextMenuRemoveSection: {
    ru: 'Убрать раздел, перенести пункты в основное меню',
    en: 'Remove section and move items to main menu',
  },
  contextMenuNewSection: { ru: 'Новый раздел', en: 'New section' },
  contextMenuAddSection: { ru: 'Добавить раздел', en: 'Add section' },
  contextMenuRestore: {
    ru: 'Восстановить рекомендуемый вариант',
    en: 'Restore recommended configuration',
  },
  contextMenuInvalidName: {
    ru: 'Укажите название раздела: от 1 до 40 символов, без пробелов по краям и управляющих символов.',
    en: 'Enter a section name: 1\u201340 characters, without leading/trailing spaces or control characters.',
  },
  contextMenuSaveFailed: {
    ru: 'Не удалось сохранить меню. Повторите попытку.',
    en: 'Could not save the menu. Please try again.',
  },
  contextMenuSaving: { ru: 'Сохранение меню…', en: 'Saving menu\u2026' },
  contextMenuUnsaved: {
    ru: 'Изменения применятся после сохранения. Отмена сохранит прежнее меню.',
    en: 'Changes take effect after saving. Cancel keeps the previous menu.',
  },
  contextMenuSave: { ru: 'Сохранить меню', en: 'Save menu' },
  contextMenuCancel: { ru: 'Отмена', en: 'Cancel' },
});
