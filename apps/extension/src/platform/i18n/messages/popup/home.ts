import { defineMessageSource } from '../source';

export const popupHomeMessages = defineMessageSource({
  menuTitle: { ru: 'Всё для текущей страницы', en: 'Capture and create' },
  menuSubtitle: {
    ru: 'Снимки, запись и инструменты — всё под рукой',
    en: 'Screenshots, recording, and page tools—all in one place',
  },
  captureVisibleLabel: { ru: 'Видимая область', en: 'Visible area' },
  captureVisibleHint: {
    ru: 'Скачать снимок видимой части вкладки',
    en: 'Download the visible tab area',
  },
  captureFullLabel: { ru: 'Вся страница', en: 'Full page' },
  captureFullHint: { ru: 'Скачать снимок страницы целиком', en: 'Download the entire page' },
  captureSelectionLabel: { ru: 'Выбрать область', en: 'Select area' },
  captureSelectionHint: {
    ru: 'Выбрать и скачать область страницы',
    en: 'Select and download a page area',
  },
  quickEditTabLabel: { ru: 'В редактор', en: 'Edit capture' },
  quickEditTabHint: {
    ru: 'Снять видимую область вкладки и открыть в редакторе',
    en: 'Capture the visible tab area and open it in the editor',
  },
  quickCopyTabLabel: { ru: 'В буфер', en: 'Copy capture' },
  quickCopyTabHint: {
    ru: 'Скопировать снимок видимой области вкладки',
    en: 'Copy the visible tab area to the clipboard',
  },
  quickRecordTabLabel: { ru: 'Запись вкладки', en: 'Record tab' },
  quickRecordTabHint: {
    ru: 'Настроить и начать запись текущей вкладки',
    en: 'Configure and start recording the current tab',
  },
  workspaceTitle: { ru: 'Рабочее пространство', en: 'Workspace' },
  libraryLabel: { ru: 'Библиотека', en: 'Library' },
  libraryTitle: { ru: 'Открыть библиотеку', en: 'Open library' },
  videoEditorLabel: { ru: 'Редактор видео', en: 'Video editor' },
  toolsPageTitle: { ru: 'Инструменты страницы', en: 'Page tools' },
  toolsPageSubtitle: {
    ru: 'Откройте панель сразу в нужном режиме',
    en: 'Open the toolbar in the mode you need',
  },
  toolsEditingGroup: { ru: 'Разметка и правки', en: 'Markup and editing' },
  toolsWorkflowGroup: { ru: 'Обзор и запись', en: 'Review and recording' },
  quickActionsTitle: {
    ru: 'Быстрые действия',
    en: 'Quick actions',
  },
  quickActionsModeHint: {
    ru: 'Список быстрых действий',
    en: 'Quick action list',
  },
  shortcutsModeLabel: { ru: 'Действия', en: 'Shortcuts' },
  captureTabLabel: { ru: 'Вкладка', en: 'Tab' },
  captureTabHint: { ru: 'Снимок текущей вкладки', en: 'Capture the current tab' },
  captureWindowLabel: { ru: 'Окно', en: 'Window' },
  captureWindowHint: { ru: 'Снимок окна или экрана', en: 'Capture a window or screen' },
  toolsLabel: { ru: 'Инструменты', en: 'Tools' },
  toolsTitle: {
    ru: 'Открыть инструменты подготовки страницы',
    en: 'Open page preparation tools',
  },
  toolsOpenLabel: { ru: 'Редактировать страницу', en: 'Edit page' },
  toolsOpenHint: {
    ru: 'Разметка, режимы снимка и инструменты работы со страницей',
    en: 'Markup, capture modes, and page editing tools',
  },
  toolsIntroDescription: {
    ru: 'Выберите режим — панель откроется сразу с нужным инструментом.',
    en: 'Choose a mode to open the page toolbar with the right tool selected.',
  },
  captureButtonLabel: { ru: 'Сделать снимок', en: 'Take screenshot' },
  capturePendingLabel: { ru: 'Создание снимка…', en: 'Capturing…' },
  captureButtonTitle: { ru: 'Сделать снимок', en: 'Take screenshot' },
  captureAreaLabel: { ru: 'Область снимка', en: 'Capture area' },
  captureAreaDescription: {
    ru: 'Определяет, какую часть текущей вкладки сохранить на снимке.',
    en: 'Choose which part of the current tab to include in the screenshot.',
  },
  captureChooseFolderLabel: { ru: 'Выбрать папку', en: 'Choose folder' },
  captureSizeLabel: { ru: 'Размер', en: 'Size' },
  captureSizeDescription: {
    ru: 'Изменяет размер области страницы перед созданием снимка.',
    en: 'Resize the page viewport before the screenshot is captured.',
  },
  captureCountdownLabel: { ru: 'Отсчёт', en: 'Countdown' },
  captureCountdownDescription: {
    ru: 'Добавляет паузу перед созданием снимка, чтобы вы успели подготовить страницу.',
    en: 'Add a delay before capture so you have time to prepare the page.',
  },
  afterCaptureDescription: {
    ru: 'Выберите, что произойдёт со снимком сразу после создания.',
    en: 'Choose what happens to the screenshot immediately after capture.',
  },
  captureCountdownOff: { ru: 'Выключено', en: 'Off' },
  captureQualityLabel: { ru: 'Качество', en: 'Quality' },
  captureQualityAria: { ru: 'Качество снимка', en: 'Screenshot quality' },
  captureQualityTitle: { ru: 'Параметры изображения', en: 'Image settings' },
  captureQualityDescription: {
    ru: 'Формат и качество влияют на размер файла и детализацию снимка.',
    en: 'Format and quality affect the screenshot’s file size and detail.',
  },
  captureFormatLabel: { ru: 'Формат', en: 'Format' },
  manageSizePresets: {
    ru: 'Управление шаблонами размеров…',
    en: 'Manage presets…',
  },
  captureError: { ru: 'Не удалось сделать снимок', en: 'Failed to capture screenshot' },
  quickActionsEmpty: {
    ru: 'Быстрые действия пока не настроены.',
    en: 'Quick actions are not configured yet.',
  },
  screenshotPrepLabel: {
    ru: 'Подготовка страницы',
    en: 'Prepare page',
  },
  screenshotPrepTitle: {
    ru: 'Открыть режим подготовки страницы',
    en: 'Open page preparation mode',
  },
  imageEditorLabel: {
    ru: 'Редактор изображений',
    en: 'Image editor',
  },
  imageEditorTitle: {
    ru: 'Редактор изображений',
    en: 'Image editor',
  },
  scenarioEditorLabel: {
    ru: 'Редактор сценариев',
    en: 'Scenario editor',
  },
  scenarioEditorTitle: {
    ru: 'Редактор сценариев',
    en: 'Scenario editor',
  },
  galleryLabel: {
    ru: 'Библиотека',
    en: 'Library',
  },
  galleryTitle: {
    ru: 'Библиотека',
    en: 'Library',
  },
  openPrepError: {
    ru: 'Не удалось открыть режим подготовки',
    en: 'Failed to open preparation mode',
  },
  triggerQuickActionError: {
    ru: 'Не удалось выполнить быстрое действие',
    en: 'Failed to run quick action',
  },
  quickActionsLoadError: {
    ru: 'Не удалось загрузить быстрые действия',
    en: 'Failed to load quick actions',
  },
  enableForTab: {
    ru: 'Включить для этой вкладки',
    en: 'Enable for this tab',
  },
  alwaysEnableSite: {
    ru: 'Всегда включать на этом сайте',
    en: 'Always enable on this site',
  },
  alwaysEnableAllSites: {
    ru: 'Всегда включать на всех сайтах',
    en: 'Always enable on all sites',
  },
  pageAccessChecking: {
    ru: 'Проверяется доступ к странице',
    en: 'Checking page access',
  },
  pageAccessRequired: {
    ru: 'Сначала включите доступ к странице',
    en: 'Enable page access first',
  },
  pageAccessWorking: {
    ru: 'Включение...',
    en: 'Enabling...',
  },
  pageAccessFailed: {
    ru: 'Не удалось включить доступ к странице',
    en: 'Failed to enable page access',
  },
  quickActionsUnavailablePrefix: {
    ru: 'Скриншоты из popup недоступны на',
    en: 'Popup screenshots are unavailable on',
  },
  screenshotUnavailablePrefix: {
    ru: 'Режим подготовки страницы недоступен на',
    en: 'Page preparation mode is unavailable on',
  },
});
