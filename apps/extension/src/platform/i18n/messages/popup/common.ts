import { defineMessageSource } from '../source';

export const popupCommonMessages = defineMessageSource({
  documentTitle: {
    ru: 'Sniptale',
    en: 'Sniptale',
  },
  loading: {
    ru: 'Загрузка...',
    en: 'Loading...',
  },
  curtainBack: {
    ru: 'Назад',
    en: 'Back',
  },
  expiredTitle: {
    ru: 'Срок действия лицензии истёк',
    en: 'License expired',
  },
  expiredDescription: {
    ru: 'Обновите расширение.',
    en: 'Update the extension.',
  },
  footerGithub: {
    ru: 'GitHub',
    en: 'GitHub',
  },
  footerImageEditor: {
    ru: 'Редактор изображений',
    en: 'Image editor',
  },
  footerVideoEditor: {
    ru: 'Редактор видео',
    en: 'Video editor',
  },
  footerScenarioEditor: {
    ru: 'Редактор сценариев',
    en: 'Scenario editor',
  },
  footerGallery: {
    ru: 'Библиотека',
    en: 'Library',
  },
  footerThemeToggleAria: {
    ru: 'Переключатель темы интерфейса',
    en: 'Interface theme toggle',
  },
  footerThemeLight: {
    ru: 'Светлая тема',
    en: 'Light theme',
  },
  footerThemeDark: {
    ru: 'Тёмная тема',
    en: 'Dark theme',
  },
  footerThemeSystem: {
    ru: 'Системная тема',
    en: 'System theme',
  },
  footerLanguageToggleAria: {
    ru: 'Переключить язык интерфейса',
    en: 'Switch interface language',
  },
  footerDesignSystem: {
    ru: 'Дизайн-система',
    en: 'Design system',
  },
  footerSettings: {
    ru: 'Настройки',
    en: 'Settings',
  },
  syncActionFailed: {
    ru: 'Не удалось выполнить действие. Повторите попытку.',
    en: 'Could not complete the action. Try again.',
  },
  syncWaiting: { ru: 'Ожидает синхронизации', en: 'Waiting to sync' },
  syncPublished: { ru: 'Локальные изменения отправлены', en: 'Local changes sent' },
  syncComplete: { ru: 'Синхронизировано', en: 'Synced' },
  syncDiscovering: { ru: 'Подготовка синхронизации', en: 'Preparing sync' },
  syncRunning: { ru: 'Идёт синхронизация', en: 'Syncing' },
  syncStopping: { ru: 'Завершение синхронизации', en: 'Finishing sync' },
  syncLocked: { ru: 'Требуется разблокировка', en: 'Unlock required' },
  syncPaused: { ru: 'Синхронизация приостановлена', en: 'Sync paused' },
  syncUnknown: { ru: 'Статус синхронизации неизвестен', en: 'Sync status unknown' },
  syncUploadsInterrupted: { ru: 'Некоторые отправки прерваны', en: 'Some uploads are interrupted' },
  syncViewUploads: { ru: 'Посмотреть отправки', en: 'View uploads' },
  syncAttention: { ru: 'Синхронизация требует внимания', en: 'Sync needs attention' },
  syncNow: { ru: 'Синхронизировать', en: 'Sync now' },
  syncUnlock: { ru: 'Разблокировать', en: 'Unlock' },
  syncDetails: { ru: 'Подробности', en: 'Details' },
  syncRepair: { ru: 'Исправить', en: 'Resolve' },
  galleryStatusUsedPrefix: {
    ru: 'Занято',
    en: 'Used',
  },
  galleryStatusUnavailable: {
    ru: 'Хранилище недоступно',
    en: 'Storage unavailable',
  },
  galleryStatusAttention: {
    ru: 'Storage Manager требует внимания',
    en: 'Storage Manager needs attention',
  },
  noActiveTab: {
    ru: 'Нет активной вкладки',
    en: 'No active tab',
  },
  browserPageLabel: {
    ru: 'служебной странице браузера',
    en: 'browser internal page',
  },
  openRegularSite: {
    ru: 'Откройте обычный сайт.',
    en: 'Open a regular website.',
  },
  pageLinkCopyTitle: {
    ru: 'Копировать название и ссылку',
    en: 'Copy title and link',
  },
  pageLinkCopyRichLabel: {
    ru: 'WYSIWYG-ссылка',
    en: 'WYSIWYG link',
  },
  pageLinkCopyMarkdownLabel: {
    ru: 'Markdown',
    en: 'Markdown',
  },
  pageLinkCopyPlainLabel: {
    ru: 'Название + URL',
    en: 'Title + URL',
  },
  restrictedPageFeatures: {
    ru: 'На этой странице часть функций недоступна',
    en: 'Some features are unavailable on this page',
  },
  stalePageRuntimeHint: {
    ru: 'Страница использует устаревшую версию расширения. Обновите страницу и повторите действие.',
    en: 'This page is using an outdated extension runtime. Refresh the page and try again.',
  },
});
