import { defineMessageSource } from '../source';
import { popupExportWebSnapshotMessages } from './export-web-snapshot';

export const popupExportMessages = defineMessageSource({
  preparingPreview: {
    ru: 'Подготовка экспорта...',
    en: 'Preparing export...',
  },
  screenshotPermissionDeniedWarning: {
    ru: 'Доступ ко всем страницам не выдан: экспорт продолжен без полноразмерных скриншотов.',
    en: 'All-sites access was not granted; export continued without full-page screenshots.',
  },
  manualTabConflictWarning: {
    ru: 'Скриншоты больше не снимаются: активная вкладка была переключена вручную.',
    en: 'Screenshot capture stopped because the active tab was changed manually.',
  },
  tabUnavailableWarningPrefix: {
    ru: 'Вкладка недоступна',
    en: 'Tab is unavailable',
  },
  restoreOriginalTabWarningPrefix: {
    ru: 'Не удалось восстановить исходную вкладку',
    en: 'Could not restore the original tab',
  },
  jobInterruptedMessage: {
    ru: 'Экспорт прерван перезапуском фонового процесса',
    en: 'Export interrupted by background restart',
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
    ru: 'Состав пакета',
    en: 'Package contents',
  },
  packageDestinationLabel: {
    ru: 'Настройки действия',
    en: 'Action settings',
  },
  packageDestinationDownload: {
    ru: 'Скачать',
    en: 'Download',
  },
  packageDestinationLibrary: {
    ru: 'В библиотеку',
    en: 'To Library',
  },
  packagePresetLabel: {
    ru: 'Быстрый выбор',
    en: 'Quick selection',
  },
  packagePresetCustom: {
    ru: 'Свой состав',
    en: 'Custom',
  },
  packagePresetWebCopy: {
    ru: 'Веб-копия',
    en: 'Web copy',
  },
  packagePresetMaterials: {
    ru: 'Данные и файлы',
    en: 'Data and files',
  },
  packagePresetFull: {
    ru: 'Всё',
    en: 'Everything',
  },
  packageWebCopyLabel: {
    ru: 'Веб-копия страницы',
    en: 'Page Web copy',
  },
  packageWebCopyRequired: {
    ru: 'обязательно',
    en: 'required',
  },
  packageWebCopyDescription: {
    ru: 'Статический документ, скриншот, стили, изображения и другие ресурсы.',
    en: 'Static document, screenshot, styles, images, and other resources.',
  },
  packageWebCopyDisabledDescription: {
    ru: 'Функция выключена. Откройте настройки, чтобы добавить безопасную автономную копию.',
    en: 'The feature is off. Open Settings to add a safe self-contained copy.',
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
    ru: 'Страницы',
    en: 'Pages',
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
  includeAnnotationsLabel: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  includeAnnotationsDescription: {
    ru: 'Комментарии и изменения элементов',
    en: 'Element comments and changes',
  },
  includeJsonLabel: {
    ru: 'JSON',
    en: 'JSON',
  },
  includeJsonDescription: {
    ru: 'Структура и данные страницы',
    en: 'Page structure and data',
  },
  includeMarkdownLabel: {
    ru: 'Markdown',
    en: 'Markdown',
  },
  includeMarkdownDescription: {
    ru: 'Текст и таблицы',
    en: 'Text and tables',
  },
  includeFilesLabel: {
    ru: 'Файлы',
    en: 'Files',
  },
  includeFilesDescription: {
    ru: 'Документы и вложения со страницы',
    en: 'Documents and attachments from the page',
  },
  includeImagesLabel: {
    ru: 'Изображения',
    en: 'Images',
  },
  includeImagesDescription: {
    ru: 'Изображения и превью со страницы',
    en: 'Images and previews from the page',
  },
  includeBasicLogsLabel: {
    ru: 'Журнал экспорта',
    en: 'Export log',
  },
  includeBasicLogsDescription: {
    ru: 'Сведения о странице, ходе сбора и предупреждениях экспорта',
    en: 'Page details, collection notes, and export warnings',
  },
  includePageDiagnosticsLabel: {
    ru: 'Расширенные данные страницы',
    en: 'Extended page data',
  },
  includePageDiagnosticsDescription: {
    ru: 'Для скачиваемого пакета: видимый текст, структура, исходные ссылки и метаданные скриптов',
    en: 'For downloaded packages: visible text, structure, original links, and script metadata',
  },
  includePageDiagnosticsDisclosure: {
    ru: 'Может содержать личные данные с открытой страницы. Сохраняется только в скачиваемый пакет и никогда не запускается.',
    en: 'May contain private data from the open page. It is stored only in the downloaded package and is never executed.',
  },
  includeCssDiagnosticsLabel: {
    ru: 'Оформление и стили',
    en: 'Design and styles',
  },
  includeCssDiagnosticsDescription: {
    ru: 'Цвета, шрифты, CSS-стили и параметры элементов',
    en: 'Colors, fonts, CSS styles, and element properties',
  },
  includeFullPageScreenshotLabel: {
    ru: 'Скриншот',
    en: 'Screenshot',
  },
  includeFullPageScreenshotDescription: {
    ru: 'Снимок всей страницы целиком',
    en: 'Capture of the entire page',
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
  batchAggregateLimitError: {
    ru: 'Пакет пропущен: общий объём распакованных данных превысил 250 МиБ',
    en: 'Package skipped: aggregate decoded data exceeded 250 MiB',
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
