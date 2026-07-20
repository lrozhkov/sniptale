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
  footerDesignSystem: {
    ru: 'Дизайн-система',
    en: 'Design system',
  },
  footerAppliedStyles: {
    ru: 'Показать примененные стили',
    en: 'Show applied styles',
  },
  footerSettings: {
    ru: 'Настройки',
    en: 'Settings',
  },
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
