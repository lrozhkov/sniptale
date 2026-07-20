import { defineMessageSource } from '../source';

export const popupSettingsFormMessages = defineMessageSource({
  noActiveTab: {
    ru: 'Нет активной вкладки',
    en: 'No active tab',
  },
  toggleToolbarError: {
    ru: 'Не удалось переключить панель',
    en: 'Failed to toggle the toolbar',
  },
  toggleToolbarErrorGeneric: {
    ru: 'Ошибка при переключении панели',
    en: 'Toolbar toggle failed',
  },
  toggleModeError: {
    ru: 'Не удалось переключить режим',
    en: 'Failed to toggle the mode',
  },
  toggleModeErrorGeneric: {
    ru: 'Ошибка при переключении режима',
    en: 'Mode toggle failed',
  },
  screenshotTitle: {
    ru: 'Режим скриншота',
    en: 'Screenshot mode',
  },
  toggling: {
    ru: 'Переключение...',
    en: 'Switching...',
  },
  screenshotEnabled: {
    ru: 'Режим скриншота включён',
    en: 'Screenshot mode is enabled',
  },
  screenshotEnable: {
    ru: 'Включить режим скриншота',
    en: 'Enable screenshot mode',
  },
  screenshotHint: {
    ru: 'Viewport: 1920x1080, Zoom: 100%, Навигация заблокирована',
    en: 'Viewport: 1920x1080, Zoom: 100%, Navigation is locked',
  },
  toolbarHide: {
    ru: 'Скрыть панель',
    en: 'Hide toolbar',
  },
  toolbarShow: {
    ru: 'Показать панель',
    en: 'Show toolbar',
  },
  aiSettingsTitle: {
    ru: 'Настройки AI',
    en: 'AI settings',
  },
  aiSettingsDescription: {
    ru: 'Управление провайдерами, моделями и системными промптами',
    en: 'Manage providers, models, and system prompts',
  },
  openSettings: {
    ru: 'Открыть настройки',
    en: 'Open settings',
  },
});
