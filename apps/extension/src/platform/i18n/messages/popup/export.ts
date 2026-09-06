import { defineMessageSource } from '../source';
import { popupExportWebSnapshotMessages } from './export-web-snapshot';

export const popupExportMessages = defineMessageSource({
  preparingPreview: {
    ru: 'Подготовка экспорта...',
    en: 'Preparing export...',
  },
  cancellingMessage: {
    ru: 'Останавливаем сбор...',
    en: 'Stopping collection...',
  },
  screenshotPermissionDeniedWarning: {
    ru: 'Доступ ко всем страницам не выдан: экспорт продолжен без скриншотов.',
    en: 'All-sites access was not granted; export continued without screenshots.',
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
  pageReadinessErrorDetail: {
    ru: 'Страница не завершила загрузку за отведённое время.',
    en: 'The page did not finish loading within the allowed time.',
  },
  pagePreparationErrorDetail: {
    ru: 'Страница не смогла передать данные для экспорта.',
    en: 'The page could not provide its export data.',
  },
  pageDataPreparationErrorDetail: {
    ru: 'Не удалось собрать выбранные данные страницы.',
    en: 'The selected page data could not be collected.',
  },
  webCopyPreparationErrorDetail: {
    ru: 'Не удалось собрать веб-копию страницы.',
    en: 'The page Web copy could not be collected.',
  },
  temporaryStorageErrorDetail: {
    ru: 'Не удалось сохранить или очистить временные данные экспорта.',
    en: 'Temporary export data could not be saved or cleaned up.',
  },
  exportTransportErrorDetail: {
    ru: 'Не удалось связаться с компонентом экспорта.',
    en: 'The export component could not be reached.',
  },
  downloadPreparationErrorDetail: {
    ru: 'Не удалось запустить компонент скачивания.',
    en: 'The download component could not be started.',
  },
  archiveValidationErrorDetail: {
    ru: 'Собранные данные не прошли проверку перед скачиванием.',
    en: 'The collected data could not be validated before download.',
  },
  archiveDownloadErrorDetail: {
    ru: 'Браузер не завершил скачивание архива.',
    en: 'The browser did not complete the archive download.',
  },
  librarySaveErrorDetail: {
    ru: 'Не удалось сохранить веб-копию в библиотеку.',
    en: 'The Web copy could not be saved to the Library.',
  },
  pageCollectionErrorDetail: {
    ru: 'Ни одну из выбранных страниц не удалось собрать.',
    en: 'None of the selected pages could be collected.',
  },
  exportProcessingErrorDetail: {
    ru: 'Сбой произошёл при обработке собранных данных.',
    en: 'A problem occurred while processing the collected data.',
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
  issuesTitle: {
    ru: 'Не удалось обработать',
    en: 'Could not process',
  },
  dataTypesSectionLabel: {
    ru: 'Состав пакета',
    en: 'Package contents',
  },
  dataTypesSectionDescription: {
    ru: 'Выберите веб-копию, данные, файлы и диагностику для пакета.',
    en: 'Choose the Web copy, data, files, and diagnostics for the package.',
  },
  settingsAction: { ru: 'Настройка', en: 'Settings' },
  packageCaptureSettingsTitle: {
    ru: 'Настройки снимка',
    en: 'Snapshot settings',
  },
  packageCaptureSettingsDescription: {
    ru: 'Настройте подготовку страницы и безопасные пределы вложений.',
    en: 'Configure page preparation and safe attachment limits.',
  },
  captureLazyContentLabel: {
    ru: 'Загружать содержимое при прокрутке',
    en: 'Load content while scrolling',
  },
  captureLazyContentDescription: {
    ru: 'Предварительно пройти страницу, чтобы появились отложенные изображения и блоки.',
    en: 'Warm up the page so deferred images and sections can appear.',
  },
  captureFreezeMotionLabel: {
    ru: 'Остановить анимации',
    en: 'Pause animations',
  },
  captureFreezeMotionDescription: {
    ru: 'Зафиксировать движущиеся элементы на время захвата для ровной склейки.',
    en: 'Freeze moving elements during capture for consistent stitching.',
  },
  captureFloatingElementsLabel: {
    ru: 'Закреплённые элементы',
    en: 'Pinned elements',
  },
  captureFloatingElementsDescription: {
    ru: 'Как показывать шапки, чаты и панели, закреплённые поверх страницы.',
    en: 'How headers, chats, and panels pinned over the page are captured.',
  },
  captureFloatingOnce: { ru: 'Один раз', en: 'Once' },
  captureFloatingHide: { ru: 'Скрыть', en: 'Hide' },
  captureFloatingRepeat: { ru: 'Повторять', en: 'Repeat' },
  captureBehaviorHelp: {
    ru: 'Длинные и динамические страницы захватываются в безопасных пределах приложения. Время загрузки адресов настраивается в разделе «Страницы», а качество — в настройках изображений.',
    en: 'Long and dynamic pages are captured within the app’s safety limits. Address loading waits are under Pages; image quality is configured in Image settings.',
  },
  resourceLimitsTitle: {
    ru: 'Вложения и изображения',
    en: 'Attachments and images',
  },
  resourceLimitsDescription: {
    ru: 'Ограничения действуют вместе для файлов, оригиналов из поддерживаемых превью и обычных изображений страницы.',
    en: 'Limits apply together to files, originals from supported previews, and ordinary page images.',
  },
  resourceLimitCountLabel: { ru: 'Не больше файлов', en: 'Maximum files' },
  resourceLimitFileSizeLabel: { ru: 'Размер одного файла', en: 'Per-file size' },
  resourceLimitTotalSizeLabel: { ru: 'Общий размер', en: 'Total size' },
  resourceLimitMiB: { ru: 'МБ', en: 'MiB' },
  resourceLimitsHelp: {
    ru: 'Ресурсы сверх лимита пропускаются с предупреждением, а пакет продолжает собираться.',
    en: 'Resources over a limit are skipped with a warning while package creation continues.',
  },
  packageDestinationLabel: {
    ru: 'Настройки действия',
    en: 'Action settings',
  },
  packageDestinationDownload: {
    ru: 'Скачать',
    en: 'Download',
  },
  packageDestinationDownloadDescription: {
    ru: 'Скачать полный пакет страницы как ZIP-архив.',
    en: 'Download the complete page package as a ZIP archive.',
  },
  packageDestinationLibrary: {
    ru: 'В библиотеку',
    en: 'To Library',
  },
  packageDestinationLibraryDescription: {
    ru: 'Сохранить веб-копию и открыть веб-снимок.',
    en: 'Save the Web copy and open the Web Snapshot.',
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
  packagePreferencesSaveError: {
    ru: 'Не удалось сохранить состав пакета. Повторите ещё раз.',
    en: 'Could not save the package contents. Please try again.',
  },
  packageWebCopyLabel: {
    ru: 'Веб-копия страницы',
    en: 'Page Web copy',
  },
  packageWebCopyDescription: {
    ru: 'Статический документ, стили, изображения и другие ресурсы.',
    en: 'Static document, styles, images, and other resources.',
  },
  webCopyCurrentSiteLabel: {
    ru: 'Ресурсы текущего сайта',
    en: 'Current-site resources',
  },
  webCopyCurrentSiteDescription: {
    ru: 'Загружать стили и изображения с доступом текущей вкладки.',
    en: 'Load styles and images using the current tab’s access.',
  },
  webCopyExternalSitesLabel: {
    ru: 'Ресурсы с других сайтов',
    en: 'Resources from other sites',
  },
  webCopyExternalSitesDescription: {
    ru: 'Анонимно загружать внешние стили, шрифты и изображения.',
    en: 'Load external styles, fonts, and images anonymously.',
  },
  webCopyExternalRedirectsLabel: {
    ru: 'Разрешать перенаправления ресурсов',
    en: 'Allow resource redirects',
  },
  webCopyExternalRedirectsDescription: {
    ru: 'Следовать на другой публичный HTTPS-адрес, если ресурс перенаправляет запрос.',
    en: 'Follow to another public HTTPS address when an asset redirects the request.',
  },
  webCopyExternalLinksLabel: {
    ru: 'Открывать ссылки из веб-копии',
    en: 'Open links from the Web copy',
  },
  webCopyExternalLinksDescription: {
    ru: 'Открывать сайт в новой вкладке. При переходе сайт получит обычный сетевой запрос.',
    en: 'Open the live site in a new tab. Following a link sends a normal network request to it.',
  },
  webCopyResourceSettingsError: {
    ru: 'Не удалось сохранить настройку ресурсов.',
    en: 'Could not save the resource setting.',
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
  tabsSectionDescription: {
    ru: 'Выберите открытые вкладки или добавьте список веб-адресов.',
    en: 'Choose open tabs or add a list of web addresses.',
  },
  pageSourceModeLabel: { ru: 'Источник страниц', en: 'Page source' },
  pageSourceTabs: { ru: 'Вкладки', en: 'Tabs' },
  pageSourceUrls: { ru: 'Адреса', en: 'Addresses' },
  urlInputLabel: { ru: 'Список веб-адресов', en: 'Web address list' },
  urlInputPlaceholder: {
    ru: 'Один адрес на строку\nexample.com\nhttps://example.org/page',
    en: 'One address per line\nexample.com\nhttps://example.org/page',
  },
  urlInputHelp: {
    ru: 'Можно разделять адреса новой строкой, запятой или точкой с запятой.',
    en: 'Separate addresses with a new line, comma, or semicolon.',
  },
  urlInputInvalid: {
    ru: 'Не распознано адресов: {{count}}',
    en: 'Unrecognized addresses: {{count}}',
  },
  urlInputLimit: {
    ru: 'Пропущено адресов сверх лимита: {{count}}',
    en: 'Addresses over the limit were skipped: {{count}}',
  },
  noSelectedUrls: { ru: 'Не добавлены адреса для экспорта', en: 'No addresses added for export' },
  urlPermissionDenied: {
    ru: 'Разрешите доступ к сайтам, чтобы открыть и захватить добавленные адреса.',
    en: 'Allow site access to open and capture the added addresses.',
  },
  pageSettingsTitle: { ru: 'Настройки захвата страниц', en: 'Page capture settings' },
  pageSettingsDescription: {
    ru: 'Настройте ожидание загрузки для вкладок и добавленных адресов.',
    en: 'Configure loading waits for tabs and added addresses.',
  },
  pageLoadTimeout: { ru: 'Ожидание загрузки', en: 'Page load timeout' },
  pageSettleDelay: { ru: 'Пауза после загрузки', en: 'Delay after loading' },
  pageTimingHelp: {
    ru: 'Если страница не загрузится вовремя, она будет пропущена. Пауза помогает дождаться анимаций и динамического содержимого.',
    en: 'A page that does not load in time is skipped. The delay lets animations and dynamic content settle.',
  },
  noDelay: { ru: 'Без паузы', en: 'No delay' },
  secondsShort: { ru: 'с', en: 'sec' },
  temporaryTabsCleanupWarning: {
    ru: 'Не удалось автоматически закрыть некоторые временные вкладки.',
    en: 'Some temporary capture tabs could not be closed automatically.',
  },
  editButton: {
    ru: 'Изменить',
    en: 'Edit',
  },
  doneButton: {
    ru: 'Готово',
    en: 'Done',
  },
  backButton: {
    ru: 'Назад',
    en: 'Back',
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
    ru: 'Вложения',
    en: 'Attachments',
  },
  includeFilesDescription: {
    ru: 'Явные ссылки скачивания и поддерживаемые вложения страницы',
    en: 'Explicit download links and supported page attachments',
  },
  includeImagesLabel: {
    ru: 'Изображения',
    en: 'Images',
  },
  includeImagesDescription: {
    ru: 'Обычные изображения и оригиналы из поддерживаемых превью',
    en: 'Ordinary images and originals from supported previews',
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
    ru: 'Видимый текст, структура, исходные ссылки и метаданные скриптов',
    en: 'Visible text, structure, original links, and script metadata',
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
    ru: 'Скриншот всей страницы',
    en: 'Full-page screenshot',
  },
  includeFullPageScreenshotDescription: {
    ru: 'Снимок всей страницы целиком',
    en: 'Capture of the entire page',
  },
  includeViewportScreenshotLabel: {
    ru: 'Скриншот видимой части',
    en: 'Visible-area screenshot',
  },
  includeViewportScreenshotDescription: {
    ru: 'Отдельный снимок области, которая видна перед началом захвата',
    en: 'A separate capture of the area visible before collection starts',
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
