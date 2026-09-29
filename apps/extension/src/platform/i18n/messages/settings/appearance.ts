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
  contextMenuCustomize: { ru: 'Настроить дерево команд', en: 'Customize command tree' },
  contextMenuRoot: { ru: 'Основное меню', en: 'Main menu' },
  contextMenuEditorHelp: {
    ru: 'Выберите команду в каталоге и добавьте её в основной список или раздел. Меняйте порядок перетаскиванием или кнопками строки. Изменения применятся после сохранения.',
    en: 'Choose a command in the catalog and add it to the main list or a section. Reorder with drag and drop or row buttons. Changes take effect after saving.',
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
    ru: 'Проверьте названия и команды. В новом меню допускается не более 9 разделов и 80 пунктов; старое меню продолжит работать, пока вы не сохраните подходящую структуру.',
    en: 'Check names and commands. The new menu supports up to 9 sections and 80 items; the old menu remains active until you save a valid structure.',
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
  contextMenuReady: { ru: 'Меню готово к редактированию', en: 'Menu ready to edit' },
  contextMenuSave: { ru: 'Сохранить меню', en: 'Save menu' },
  contextMenuCancel: { ru: 'Отмена', en: 'Cancel' },
  contextMenuGroupScreenshots: { ru: 'Снимки', en: 'Screenshots' },
  contextMenuGroupVideo: { ru: 'Видео', en: 'Video' },
  contextMenuGroupExport: { ru: 'Экспорт', en: 'Export' },
  contextMenuGroupOpen: { ru: 'Открыть', en: 'Open' },
  contextMenuGroupCopy: { ru: 'Скопировать ссылку', en: 'Copy page link' },
  contextMenuGroupWindow: { ru: 'Размер окна', en: 'Window size' },
  contextMenuMissingCommand: { ru: 'Недоступная команда', en: 'Unavailable command' },
  contextMenuCatalog: { ru: 'Каталог команд', en: 'Command catalog' },
  contextMenuSearch: { ru: 'Найти команду', en: 'Find a command' },
  contextMenuTree: { ru: 'Структура меню', en: 'Menu structure' },
  contextMenuPreview: { ru: 'Предпросмотр меню', en: 'Menu preview' },
  contextMenuAddCommand: { ru: 'Добавить команду', en: 'Add command' },
  contextMenuAdded: { ru: 'Добавлена', en: 'Added' },
  contextMenuUnavailable: {
    ru: 'Недоступна в текущих настройках',
    en: 'Unavailable in current settings',
  },
  contextMenuRemoveCommand: { ru: 'Удалить команду', en: 'Remove command' },
  contextMenuRename: { ru: 'Переименовать', en: 'Rename' },
  contextMenuExpand: { ru: 'Развернуть', en: 'Expand' },
  contextMenuCollapse: { ru: 'Свернуть', en: 'Collapse' },
  contextMenuInside: { ru: 'В раздел', en: 'Move into section' },
  contextMenuOutside: { ru: 'На уровень выше', en: 'Move out of section' },
  contextMenuBefore: { ru: 'Перед выбранным', en: 'Before selected' },
  contextMenuAfter: { ru: 'После выбранного', en: 'After selected' },
  contextMenuInsideSelected: { ru: 'В выбранный раздел', en: 'Inside selected section' },
  contextMenuCreateSection: { ru: 'Создать раздел здесь', en: 'Create section here' },
  contextMenuEmptyCatalog: { ru: 'Команды не найдены', en: 'No commands found' },
  contextMenuEmptyTree: {
    ru: 'Добавьте команду из каталога',
    en: 'Add a command from the catalog',
  },
  contextMenuCatalogLoading: { ru: 'Загрузка команд…', en: 'Loading commands…' },
  contextMenuCatalogFailed: {
    ru: 'Не удалось загрузить быстрые действия',
    en: 'Could not load quick actions',
  },
  contextMenuSettingsFailed: {
    ru: 'Не удалось загрузить сохранённое меню',
    en: 'Could not load the saved menu',
  },
  contextMenuCatalogRetry: { ru: 'Повторить загрузку', en: 'Retry loading' },
  contextMenuMoveHelp: {
    ru: 'Стрелки перемещают фокус по дереву. Для изменения порядка используйте кнопки строки или перетаскивание.',
    en: 'Arrow keys move focus through the tree. Use row buttons or drag to reorder.',
  },
  contextMenuNoPreview: { ru: 'Включённых команд пока нет', en: 'No enabled commands yet' },
  contextMenuDrag: { ru: 'Перетащить пункт', en: 'Drag item' },
  contextMenuMoved: { ru: 'Пункт перемещён', en: 'Item moved' },
  contextMenuDestination: { ru: 'Раздел для новой команды', en: 'Section for new command' },
  contextMenuPosition: { ru: 'Позиция новой команды', en: 'New command position' },
  contextMenuAtEnd: { ru: 'В конце раздела', en: 'At end of section' },
  contextMenuMainMenu: { ru: 'Основное меню', en: 'Main menu' },
  contextMenuResetDraft: { ru: 'Отменить изменения', en: 'Discard changes' },
  contextMenuSaved: { ru: 'Меню сохранено', en: 'Menu saved' },
});
