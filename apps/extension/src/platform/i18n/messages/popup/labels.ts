import { defineMessageSource } from '../source';

export const popupLabelsMessages = defineMessageSource({
  screenshotMode: {
    ru: 'Скриншот',
    en: 'Screenshot',
  },
  captureModeTab: {
    ru: 'Вкладка',
    en: 'Tab',
  },
  captureModeArea: {
    ru: 'Область',
    en: 'Area',
  },
  captureModePreset: {
    ru: 'Пресет',
    en: 'Preset',
  },
  captureModeScreen: {
    ru: 'Экран',
    en: 'Screen',
  },
  qualityUltra: {
    ru: 'Ультра',
    en: 'Ultra',
  },
  qualityHigh: {
    ru: 'Высокое',
    en: 'High',
  },
  qualityMedium: {
    ru: 'Среднее',
    en: 'Medium',
  },
  qualityLow: {
    ru: 'Низкое',
    en: 'Low',
  },
  qualityUltraDescription: {
    ru: '60 fps',
    en: '60 fps',
  },
  qualityHighDescription: {
    ru: '30 fps',
    en: '30 fps',
  },
  qualityMediumDescription: {
    ru: 'Баланс',
    en: 'Balanced',
  },
  qualityLowDescription: {
    ru: 'Минимум веса',
    en: 'Minimum size',
  },
  statusPreparing: {
    ru: 'Подготовка',
    en: 'Preparing',
  },
  statusCountdown: {
    ru: 'Отсчёт',
    en: 'Countdown',
  },
  statusRecording: {
    ru: 'Запись',
    en: 'Recording',
  },
  statusPaused: {
    ru: 'Пауза',
    en: 'Paused',
  },
  statusSaving: {
    ru: 'Сохранение',
    en: 'Saving',
  },
  statusReady: {
    ru: 'Готово',
    en: 'Ready',
  },
  sourceActiveTab: {
    ru: 'Активная вкладка',
    en: 'Active tab',
  },
  sourceTabArea: {
    ru: 'Область вкладки',
    en: 'Tab area',
  },
  sourceScreen: {
    ru: 'Экран',
    en: 'Screen',
  },
  sourceViewportPreset: {
    ru: 'Viewport-пресет',
    en: 'Viewport preset',
  },
  sourceViewportPrefix: {
    ru: 'Viewport',
    en: 'Viewport',
  },
  sourcePending: {
    ru: 'Источник будет определён при запуске',
    en: 'The source will be detected when recording starts',
  },
  modeUnavailablePrefix: {
    ru: 'Режим',
    en: 'Mode',
  },
  modeUnavailableMiddle: {
    ru: 'недоступен на',
    en: 'is unavailable on',
  },
  modeUnavailableSuffix: {
    ru: 'Используйте режим "Экран" или откройте обычный сайт.',
    en: 'Use "Screen" mode or open a regular website.',
  },
});
