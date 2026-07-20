import { defineMessageSource } from '../source';

export const settingsPrivacyMessages = defineMessageSource({
  kicker: {
    ru: 'Локальные данные',
    en: 'Local data',
  },
  title: {
    ru: 'Конфиденциальность',
    en: 'Privacy',
  },
  description: {
    ru: 'Удаляйте локальные данные расширения из IndexedDB, хранилищ браузера и временного состояния.',
    en: 'Delete local extension data from IndexedDB, browser storage, and temporary runtime state.',
  },
  dataClassesTitle: {
    ru: 'Будут очищены',
    en: 'Cleared data classes',
  },
  dataClasses: {
    ru: 'Скриншоты, записи, веб-снимки, проекты, черновики редакторов, телеметрия, диагностика, история AI-запросов и временные задания.',
    en: 'Screenshots, recordings, web snapshots, projects, editor drafts, telemetry, diagnostics, AI request history, and temporary jobs.',
  },
  deleteLocalDataTitle: {
    ru: 'Удалить локальные данные',
    en: 'Delete Local Data',
  },
  deleteLocalDataDescription: {
    ru: 'Оставляет настройки интерфейса и сохраненные ключи AI-провайдеров.',
    en: 'Keeps interface preferences and stored AI provider keys.',
  },
  factoryResetTitle: {
    ru: 'Сбросить полностью',
    en: 'Factory Reset',
  },
  factoryResetDescription: {
    ru: 'Удаляет локальные данные, настройки и ключи AI-провайдеров.',
    en: 'Deletes local data, preferences, and AI provider keys.',
  },
  startDelete: {
    ru: 'Удалить данные',
    en: 'Delete Data',
  },
  confirmDelete: {
    ru: 'Подтвердить удаление',
    en: 'Confirm Delete',
  },
  startFactoryReset: {
    ru: 'Сбросить',
    en: 'Reset',
  },
  confirmFactoryReset: {
    ru: 'Подтвердить сброс',
    en: 'Confirm Reset',
  },
  working: {
    ru: 'Удаление...',
    en: 'Deleting...',
  },
  success: {
    ru: 'Локальные данные удалены.',
    en: 'Local data deleted.',
  },
  error: {
    ru: 'Не удалось удалить локальные данные.',
    en: 'Failed to delete local data.',
  },
  pageStorageVerificationError: {
    ru: 'Не удалось подтвердить очистку локального хранилища страницы настроек.',
    en: 'Could not verify settings page local storage cleanup.',
  },
});
