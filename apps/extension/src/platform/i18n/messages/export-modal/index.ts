import { defineMessageSource } from '../source';

export const exportModalMessages = defineMessageSource({
  title: {
    ru: 'Экспорт страницы',
    en: 'Page export',
  },
  subtitleOptions: {
    ru: 'Выберите данные для экспорта',
    en: 'Choose data to export',
  },
  subtitleResults: {
    ru: 'Результаты экспорта',
    en: 'Export results',
  },
  copied: {
    ru: 'Скопировано',
    en: 'Copied',
  },
  copyButton: {
    ru: 'Копировать',
    en: 'Copy',
  },
  includeJsonLabel: {
    ru: 'Включить JSON',
    en: 'Include JSON',
  },
  includeJsonDescription: {
    ru: 'Таблицы, поля, текстовые данные в формате JSON',
    en: 'Tables, fields, and text data in JSON format',
  },
  includeMarkdownLabel: {
    ru: 'Включить Markdown',
    en: 'Include Markdown',
  },
  includeMarkdownDescription: {
    ru: 'Таблицы, поля, текстовые данные в формате Markdown',
    en: 'Tables, fields, and text data in Markdown format',
  },
  includeFilesLabel: {
    ru: 'Скачать файлы и изображения',
    en: 'Download files and images',
  },
  includeFilesDescription: {
    ru: 'Скачанные файлы из таблиц и вложений',
    en: 'Downloaded files from tables and attachments',
  },
  includeImagesLabel: {
    ru: 'Обрабатывать изображения',
    en: 'Process images',
  },
  includeImagesDescription: {
    ru: 'Извлекать оригиналы из Froala редакторов и модальных окон превью',
    en: 'Extract originals from Froala editors and preview modal windows',
  },
  resultSuccess: {
    ru: 'Экспорт завершён успешно!',
    en: 'Export completed successfully!',
  },
  resultErrorSuffix: {
    ru: ' экспорта',
    en: ' export',
  },
  statSections: {
    ru: 'Секций',
    en: 'Sections',
  },
  statRows: {
    ru: 'Строк таблиц',
    en: 'Table rows',
  },
  statFiles: {
    ru: 'Файлов',
    en: 'Files',
  },
  statErrors: {
    ru: 'Ошибок',
    en: 'Errors',
  },
  errorsTitlePrefix: {
    ru: 'Ошибки (',
    en: 'Errors (',
  },
  errorsTitleSuffix: {
    ru: '):',
    en: '):',
  },
  moreErrorsPrefix: {
    ru: '...и ещё ',
    en: '...and ',
  },
  moreErrorsSuffix: {
    ru: ' ошибок',
    en: ' more errors',
  },
  phaseScanning: {
    ru: 'Сканирование...',
    en: 'Scanning...',
  },
  phaseDownloading: {
    ru: 'Скачивание...',
    en: 'Downloading...',
  },
  phaseZipping: {
    ru: 'Архивация...',
    en: 'Archiving...',
  },
  cancelButton: {
    ru: 'Отменить',
    en: 'Cancel',
  },
  newExportButton: {
    ru: 'Новый экспорт',
    en: 'New export',
  },
  exportButton: {
    ru: 'Экспортировать',
    en: 'Export',
  },
  preparingMessage: {
    ru: 'Подготовка...',
    en: 'Preparing...',
  },
  cancelledMessage: {
    ru: 'Отменено',
    en: 'Cancelled',
  },
  cancelledByUserError: {
    ru: 'Экспорт отменён пользователем',
    en: 'Export was cancelled by the user',
  },
});
