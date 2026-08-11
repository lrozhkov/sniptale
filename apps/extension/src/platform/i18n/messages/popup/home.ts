import { defineMessageSource } from '../source';

export const popupHomeMessages = defineMessageSource({
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
  toolsOpenLabel: { ru: 'Открыть панель инструментов', en: 'Open toolbar' },
  toolsOpenHint: {
    ru: 'Открыть инструменты без смены выбранного режима',
    en: 'Open tools without changing the selected mode',
  },
  captureButtonLabel: { ru: 'Сделать снимок', en: 'Take screenshot' },
  capturePendingLabel: { ru: 'Создание снимка…', en: 'Capturing…' },
  captureButtonTitle: { ru: 'Сделать снимок', en: 'Take screenshot' },
  captureAreaLabel: { ru: 'Область снимка', en: 'Capture area' },
  captureSizeLabel: { ru: 'Размер', en: 'Size' },
  captureCountdownLabel: { ru: 'Отсчёт', en: 'Countdown' },
  captureCountdownOff: { ru: 'Выключено', en: 'Off' },
  captureQualityLabel: { ru: 'Качество', en: 'Quality' },
  captureQualityAria: { ru: 'Качество снимка', en: 'Screenshot quality' },
  captureQualityTitle: { ru: 'Параметры изображения', en: 'Image settings' },
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
    ru: 'Галерея',
    en: 'Gallery',
  },
  galleryTitle: {
    ru: 'Галерея',
    en: 'Gallery',
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
