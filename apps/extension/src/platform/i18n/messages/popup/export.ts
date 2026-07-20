import { defineMessageSource } from '../source';
import { popupExportWebSnapshotMessages } from './export-web-snapshot';

const INCLUDE_HAR_DOM_LOGS_DESCRIPTION_RU = [
  'DOM, HAR и console details;',
  'credentials и чувствительные URL-параметры редактируются',
].join(' ');
const INCLUDE_HAR_DOM_LOGS_DESCRIPTION_EN = [
  'DOM, HAR, and console details;',
  'credentials and sensitive URL parameters are redacted',
].join(' ');

export const popupExportMessages = defineMessageSource({
  preparingPreview: {
    ru: 'Подготовка экспорта...',
    en: 'Preparing export...',
  },
  collectingTitle: {
    ru: 'Собираем материалы',
    en: 'Collecting materials',
  },
  collectingDescription: {
    ru: 'Показываем, какие данные уже готовы и что ещё обрабатывается.',
    en: 'Shows which data is ready and what is still processing.',
  },
  unavailableTitle: {
    ru: 'Экспорт недоступен',
    en: 'Export unavailable',
  },
  retryButton: {
    ru: 'Повторить',
    en: 'Retry',
  },
  savedArchive: {
    ru: 'Архив сохранён',
    en: 'Archive saved',
  },
  completedTitle: {
    ru: 'Экспорт завершен',
    en: 'Export completed',
  },
  completedDescription: {
    ru: 'Файл подготовлен. Можно снова запустить экспорт или обновить отчет.',
    en: 'The file is ready. You can export again or refresh the report.',
  },
  finishedWithErrors: {
    ru: 'Экспорт завершён с ошибками',
    en: 'Export finished with errors',
  },
  dataTypesSectionLabel: {
    ru: 'Тип данных',
    en: 'Data type',
  },
  contentGroupLabel: {
    ru: 'Содержимое',
    en: 'Content',
  },
  diagnosticsGroupLabel: {
    ru: 'Диагностика',
    en: 'Diagnostics',
  },
  tabsSectionLabel: {
    ru: 'Страницы для экспорта',
    en: 'Pages to export',
  },
  editButton: {
    ru: 'Изменить',
    en: 'Edit',
  },
  doneButton: {
    ru: 'Готово',
    en: 'Done',
  },
  removeFromSelectionAction: {
    ru: 'Убрать из экспорта',
    en: 'Remove from export',
  },
  noSelectedDataTypes: {
    ru: 'Ничего не выбрано',
    en: 'Nothing selected',
  },
  noSelectedTabs: {
    ru: 'Не выбраны страницы для экспорта',
    en: 'No pages selected for export',
  },
  dataTypesFilterPlaceholder: {
    ru: 'Фильтр типов данных',
    en: 'Filter data types',
  },
  tabsFilterPlaceholder: {
    ru: 'Фильтр вкладок',
    en: 'Filter tabs',
  },
  selectAllTabsButton: {
    ru: 'Выделить все',
    en: 'Select all',
  },
  clearAllTabsButton: {
    ru: 'Снять все',
    en: 'Clear all',
  },
  currentTabBadge: {
    ru: 'Текущая',
    en: 'Current',
  },
  noSelectableTabsHint: {
    ru: 'Выберите хотя бы одну доступную вкладку для экспорта.',
    en: 'Select at least one exportable tab.',
  },
  sectionsStat: {
    ru: 'Секций',
    en: 'Sections',
  },
  rowsStat: {
    ru: 'Строк',
    en: 'Rows',
  },
  filesStat: {
    ru: 'Файлов',
    en: 'Files',
  },
  errorsStat: {
    ru: 'Ошибок',
    en: 'Errors',
  },
  exportAgainButton: {
    ru: 'Экспорт снова',
    en: 'Export again',
  },
  cancelExportButton: {
    ru: 'Остановить сбор',
    en: 'Cancel export',
  },
  includeJsonLabel: {
    ru: 'JSON',
    en: 'JSON',
  },
  includeJsonDescription: {
    ru: 'Структура и данные страницы',
    en: 'Page structure',
  },
  includeMarkdownLabel: {
    ru: 'Markdown',
    en: 'Markdown',
  },
  includeMarkdownDescription: {
    ru: 'Текст и таблицы',
    en: 'Tables and text',
  },
  includeFilesLabel: {
    ru: 'Файлы',
    en: 'Files',
  },
  includeFilesDescription: {
    ru: 'Документы и вложения со страницы',
    en: 'Download attachments',
  },
  includeImagesLabel: {
    ru: 'Изображения',
    en: 'Images',
  },
  includeImagesDescription: {
    ru: 'Картинки и превью со страницы',
    en: 'Images and previews from the page',
  },
  includeBasicLogsLabel: {
    ru: 'Базовые логи',
    en: 'Basic logs',
  },
  includeBasicLogsDescription: {
    ru: 'Сведения о странице, ходе сбора и сообщениях консоли',
    en: 'Page details, collection notes, and page console messages',
  },
  includeHarDomLogsLabel: {
    ru: 'Подробные логи',
    en: 'Detailed logs',
  },
  includeHarDomLogsDescription: {
    ru: INCLUDE_HAR_DOM_LOGS_DESCRIPTION_RU,
    en: INCLUDE_HAR_DOM_LOGS_DESCRIPTION_EN,
  },
  includeCssDiagnosticsLabel: {
    ru: 'Стили страницы',
    en: 'Page styles',
  },
  includeCssDiagnosticsDescription: {
    ru: 'Оформление, параметры элементов и сообщения консоли',
    en: 'Page styling, element parameters, and page console messages',
  },
  includeFullPageScreenshotLabel: {
    ru: 'Скриншот',
    en: 'Screenshot',
  },
  includeFullPageScreenshotDescription: {
    ru: 'Снимок всей страницы',
    en: 'Full page',
  },
  copyButton: {
    ru: 'Копировать',
    en: 'Copy',
  },
  copied: {
    ru: 'Скопировано',
    en: 'Copied',
  },
  copyJsonButton: {
    ru: 'Копировать JSON',
    en: 'Copy JSON',
  },
  copyJsonCurrentTabTitle: {
    ru: 'Копировать JSON текущей открытой вкладки',
    en: 'Copy JSON from the current active tab',
  },
  copyMarkdownButton: {
    ru: 'Копировать Markdown',
    en: 'Copy Markdown',
  },
  copyMarkdownCurrentTabTitle: {
    ru: 'Копировать Markdown текущей открытой вкладки',
    en: 'Copy Markdown from the current active tab',
  },
  ...popupExportWebSnapshotMessages,
  exportButton: {
    ru: 'Экспортировать',
    en: 'Export',
  },
  prepareExportError: {
    ru: 'Не удалось подготовить экспорт',
    en: 'Failed to prepare export',
  },
  reloadExportError: {
    ru: 'Не удалось обновить экспорт',
    en: 'Failed to refresh export',
  },
  startExportError: {
    ru: 'Не удалось запустить экспорт',
    en: 'Failed to start export',
  },
  batchPrepareMessage: {
    ru: 'Подготавливаем массовый экспорт...',
    en: 'Preparing batch export...',
  },
  batchCollectingMessage: {
    ru: 'Собираем страницу:',
    en: 'Collecting page:',
  },
  batchArchiveMessage: {
    ru: 'Собираем общий архив...',
    en: 'Building archive...',
  },
  batchCompletedMessage: {
    ru: 'Общий архив подготовлен',
    en: 'Batch archive is ready',
  },
  startProgressMessage: {
    ru: 'Подготовка...',
    en: 'Preparing...',
  },
  stepPending: {
    ru: 'Ожидает',
    en: 'Pending',
  },
  stepInProgress: {
    ru: 'В процессе',
    en: 'In progress',
  },
  stepDone: {
    ru: 'Готово',
    en: 'Done',
  },
  stepError: {
    ru: 'Есть проблема',
    en: 'Issue',
  },
  unavailablePrefix: {
    ru: 'Экспорт страницы недоступен на',
    en: 'Page export is unavailable on',
  },
});
