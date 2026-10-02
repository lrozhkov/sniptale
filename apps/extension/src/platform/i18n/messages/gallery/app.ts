import { defineMessageSource } from '../source';

export const galleryAppMessages = defineMessageSource({
  trashTitle: { ru: 'Корзина', en: 'Trash Bin' },
  trashSummaryCount: { ru: 'В корзине', en: 'In Trash Bin' },
  trashTotalSize: { ru: 'Общий объём', en: 'Total size' },
  trashSizeExplanation: {
    ru: 'Объём всех материалов корзины, включая связанные ресурсы, документы и предпросмотры. Размер файла в строке не включает эти ресурсы.',
    en: 'Retained resources across the whole Trash Bin, including related assets, documents and previews. Row file sizes exclude these resources.',
  },
  trashRetentionDetails: { ru: 'Как работает автоочистка', en: 'How automatic cleanup works' },
  trashCountLoading: { ru: 'Загрузка корзины…', en: 'Loading Trash Bin…' },
  trashSizeLoading: { ru: 'Подсчёт объёма…', en: 'Calculating size…' },
  trashSizeUnavailable: { ru: 'Объём недоступен', en: 'Size unavailable' },
  returnToLibrary: { ru: 'В библиотеку', en: 'Back to Library' },
  trashRetentionTitle: { ru: 'Автоочистка корзины', en: 'Automatic Trash Bin cleanup' },
  trashRetentionEnabled: { ru: 'Включить автоочистку', en: 'Enable automatic cleanup' },
  trashRetentionDays: { ru: 'Удалять через', en: 'Delete after' },
  trashRetentionDaySuffix: { ru: 'дн.', en: 'days' },
  trashRetentionExplanation: {
    ru: 'Подходящие материалы удаляются навсегда при следующем открытии или обновлении Библиотеки, включая возврат к вкладке и изменения медиацентра. После включения могут удалиться и материалы, срок которых уже истёк. Файлы, используемые в проектах, сохраняются.',
    en: 'Eligible items are permanently deleted on a later Library open or refresh, including when the tab becomes visible again or the media hub changes. Items already past the selected age can be deleted after you enable cleanup. Media used by projects is retained.',
  },
  trashRetentionLoading: { ru: 'Загружаем настройку…', en: 'Loading setting…' },
  trashRetentionUnavailable: {
    ru: 'Не удалось загрузить настройку автоочистки.',
    en: 'Could not load the automatic cleanup setting.',
  },
  trashRetentionSaving: { ru: 'Сохраняем…', en: 'Saving…' },
  trashRetentionSaveFailed: {
    ru: 'Не удалось сохранить настройку. Предыдущее значение сохранено.',
    en: 'Could not save the setting. The previous value is retained.',
  },
  trashRetentionRetry: { ru: 'Повторить', en: 'Retry' },
  trashSelectAll: { ru: 'Выбрать всё', en: 'Select all' },
  trashDeselectAll: { ru: 'Снять всё выделение', en: 'Deselect All' },
  restoreTrash: { ru: 'Восстановить выбранное', en: 'Restore selected' },
  restoreItem: { ru: 'Восстановить', en: 'Restore' },
  restoringItem: { ru: 'Восстанавливаем…', en: 'Restoring…' },
  restoreItemFailed: {
    ru: 'Не удалось восстановить материал. Повторите попытку.',
    en: 'Could not restore this item. Try again.',
  },
  permanentDelete: { ru: 'Удалить навсегда', en: 'Delete permanently' },
  emptyTrash: { ru: 'Очистить корзину', en: 'Empty Trash Bin' },
  confirmPermanentDelete: { ru: 'Нажмите ещё раз, чтобы удалить', en: 'Click again to confirm' },
  moveToTrash: { ru: 'Переместить в корзину', en: 'Move to Trash Bin' },
  moveToTrashConfirm: {
    ru: 'Переместить выбранные материалы в корзину? Их можно будет восстановить.',
    en: 'Move the selected items to the Trash Bin? You can restore them later.',
  },
  permanentDeleteConfirm: {
    ru: 'Удалить выбранные материалы навсегда? Восстановить их будет невозможно.',
    en: 'Permanently delete the selected items? This cannot be undone.',
  },
  deleteChecking: { ru: 'Проверяем связи материалов…', en: 'Checking item references…' },
  deleteStateChanged: {
    ru: 'Материал изменился. Обновите библиотеку и заново выберите удаление.',
    en: 'This item changed. Refresh the library and choose deletion again.',
  },
  deleteReferencesChanged: {
    ru: 'Связи с проектами изменились после подтверждения. Заново выберите удаление и проверьте предупреждение.',
    en: 'Project references changed after confirmation. Choose deletion again and review the warning.',
  },
  deletePrimaryNextStep: {
    ru: 'Сначала удалите зависимые проекты или сохраните файл.',
    en: 'Delete the dependent projects first or keep the file.',
  },
  deleteRequiredSource: {
    ru: 'Этот файл нужен проекту как основной источник. Сначала удалите зависимый проект или сохраните файл.',
    en: 'A project requires this file as its primary source. Delete the dependent project first or keep the file.',
  },
  deleteScenarioBusy: {
    ru: 'Связанный сценарий открыт в редакторе или его ресурсы используются. Закройте редактор, дождитесь завершения экспорта и повторите удаление.',
    en: 'A linked scenario is open in an editor or its resources are in use. Close the editor, wait for export to finish, and retry deletion.',
  },
  deleteInvalidGraph: {
    ru: 'Не удалось проверить сохранённые связи проектов. Материал сохранён. Проверьте доступность проектов перед повторным удалением.',
    en: 'Stored project references could not be verified. The item is retained. Check that the projects are available before retrying deletion.',
  },
  deleteInvalidVideoProject: {
    ru: 'Удаление остановлено: не удалось проверить данные видеопроекта и его связь с файлом. Файл сохранён. Обновление библиотеки не исправит эту запись.',
    en: 'Deletion stopped: a video project and its file references could not be verified. The file is retained. Refreshing the library will not repair this record.',
  },
  deleteInvalidScenarioProject: {
    ru: 'Удаление остановлено: данные связанного сценария не прошли проверку. Файл сохранён. Обновление библиотеки не исправит эту запись.',
    en: 'Deletion stopped: a linked scenario did not pass validation. The file is retained. Refreshing the library will not repair this record.',
  },
  deleteInvalidScenarioAsset: {
    ru: 'Удаление остановлено: не удалось проверить ресурс сценария и его связь с файлом. Файл сохранён. Обновление библиотеки не исправит эту запись.',
    en: 'Deletion stopped: a scenario resource and its file reference could not be verified. The file is retained. Refreshing the library will not repair this record.',
  },
  deleteInvalidQuickEdit: {
    ru: 'Удаление остановлено: не удалось проверить данные быстрого редактирования другого файла. Удаляемый файл сохранён. Обновление библиотеки не исправит эту запись.',
    en: 'Deletion stopped: another file’s quick-edit data could not be verified. The selected file is retained. Refreshing the library will not repair this record.',
  },
  deleteSourceUnavailable: {
    ru: 'Исходные данные файла недоступны. Не удалось завершить удаление; обновите библиотеку и повторите попытку.',
    en: 'The original file data is unavailable. Deletion could not finish; refresh the library and retry.',
  },
  deleteUnsupportedSource: {
    ru: 'Этот тип материала нельзя удалить с изменением связанных проектов. Сначала удалите его из проектов.',
    en: 'This item type cannot be deleted while changing linked projects. Remove it from the projects first.',
  },
  deletePendingPublication: {
    ru: 'Сохранение изображения ещё не завершено. Дождитесь завершения сохранения и повторите удаление.',
    en: 'The image save has not finished. Wait for it to complete and retry deletion.',
  },
  trashEmpty: { ru: 'Корзина пуста', en: 'Trash Bin is empty' },
  trashNoResults: { ru: 'В корзине ничего не найдено', en: 'No matching items in Trash Bin' },
  trashSearchPlaceholder: { ru: 'Поиск', en: 'Search' },
  trashSearchLabel: { ru: 'Поиск в корзине', en: 'Search Trash Bin' },
  trashCleanupFailed: {
    ru: 'Не удалось завершить автоочистку корзины. Оставшиеся материалы сохранены; повторите обновление.',
    en: 'Automatic Trash Bin cleanup could not finish. Remaining items are retained; refresh to retry.',
  },
  title: {
    ru: 'Библиотека',
    en: 'Library',
  },
  documentTitle: {
    ru: 'Sniptale — Библиотека',
    en: 'Sniptale — Library',
  },
  description: {
    ru: 'Все сохранённые скриншоты, видеозаписи и экспорты в одном месте.',
    en: 'All saved screenshots, recordings, and exports in one place.',
  },
  storageClasses: {
    ru: 'Раздел хранилища',
    en: 'Storage section',
  },
  library: {
    ru: 'Библиотека',
    en: 'Library',
  },
  drafts: {
    ru: 'Черновики',
    en: 'Drafts',
  },
  draftExpires: {
    ru: 'Удаление:',
    en: 'Deletes:',
  },
  draftNoExpiration: {
    ru: 'Без срока удаления',
    en: 'No expiration',
  },
  updatingPreview: {
    ru: 'Обновляем превью…',
    en: 'Updating preview…',
  },
  previewUnavailable: {
    ru: 'Превью недоступно',
    en: 'Preview unavailable',
  },
  openEditorToRetryPreview: {
    ru: 'Открыть редактор для повтора превью',
    en: 'Open editor to retry preview',
  },
  storageTitle: {
    ru: 'Хранилище',
    en: 'Storage',
  },
  storageUnavailable: {
    ru: 'Недоступно',
    en: 'Unavailable',
  },
  storageUsed: {
    ru: 'Занято',
    en: 'Used',
  },
  storageAvailable: {
    ru: 'Свободно',
    en: 'Available',
  },
  storagePersistentPrefix: {
    ru: 'Постоянное хранилище:',
    en: 'Persistent storage:',
  },
  storagePersistentEnabled: {
    ru: 'включён',
    en: 'enabled',
  },
  storagePersistentPending: {
    ru: 'не подтверждён',
    en: 'not confirmed',
  },
  storagePersistentUnavailable: {
    ru: 'недоступно',
    en: 'unavailable',
  },
  openLibrary: {
    ru: 'Открыть Библиотеку',
    en: 'Open Library',
  },
  storageTools: {
    ru: 'Управление хранилищем',
    en: 'Storage tools',
  },
  deleteAll: {
    ru: 'Удалить всё',
    en: 'Delete all',
  },
  backupOperationRunning: {
    ru: 'Операция выполняется…',
    en: 'Operation in progress…',
  },
  tagsTitle: {
    ru: 'Теги',
    en: 'Tags',
  },
  tagsEmpty: {
    ru: 'Пока нет пользовательских тегов.',
    en: 'No custom tags yet.',
  },
  facetTitle: {
    status: { ru: 'Статус', en: 'Status' },
    tags: { ru: 'Теги', en: 'Tags' },
    format: { ru: 'Тип файла', en: 'File type' },
    size: { ru: 'Размер', en: 'Size' },
    resolution: { ru: 'Разрешение', en: 'Resolution' },
    duration: { ru: 'Длительность', en: 'Duration' },
    source: { ru: 'Источник', en: 'Source' },
    created: { ru: 'Дата создания', en: 'Date created' },
    updated: { ru: 'Дата изменения', en: 'Date modified' },
  },
  facetSearch: {
    ru: 'Найти',
    en: 'Find',
  },
  facetClearSearch: {
    ru: 'Очистить поиск',
    en: 'Clear search',
  },
  facetSelected: {
    ru: 'Выбрано',
    en: 'Selected',
  },
  facetClear: {
    ru: 'Сбросить',
    en: 'Clear',
  },
  facetResetAll: {
    ru: 'Сбросить',
    en: 'Reset',
  },
  savedViewsHeading: {
    ru: 'Сохранённые виды',
    en: 'Saved views',
  },
  savedViewSave: {
    ru: 'Сохранить вид',
    en: 'Save view',
  },
  savedViewUpdate: {
    ru: 'Обновить вид',
    en: 'Update view',
  },
  savedViewName: {
    ru: 'Название вида',
    en: 'View name',
  },
  savedViewConfirm: {
    ru: 'Сохранить вид',
    en: 'Save view',
  },
  savedViewDelete: {
    ru: 'Удалить вид',
    en: 'Delete view',
  },
  savedViewMoveUp: {
    ru: 'Переместить выше',
    en: 'Move up',
  },
  savedViewMoveDown: {
    ru: 'Переместить ниже',
    en: 'Move down',
  },
  savedViewShowMore: {
    ru: 'Показать ещё',
    en: 'Show more',
  },
  savedViewReorderFailed: {
    ru: 'Не удалось изменить порядок видов.',
    en: 'Could not reorder saved views.',
  },
  actionFailed: {
    ru: 'Не удалось выполнить действие. Попробуйте ещё раз.',
    en: 'Could not complete the action. Please try again.',
  },
  savedViewDeleteTitle: {
    ru: 'Удалить сохранённый вид?',
    en: 'Delete saved view?',
  },
  savedViewDeleteMessage: {
    ru: 'Вид «{name}» будет удалён. Объекты библиотеки останутся без изменений.',
    en: 'The “{name}” view will be deleted. Library items will not be affected.',
  },
  savedViewDeleteFailed: {
    ru: 'Не удалось удалить сохранённый вид.',
    en: 'Could not delete the saved view.',
  },
  savedViewNameConflict: {
    ru: 'В этой категории уже есть вид с таким названием.',
    en: 'A view with this name already exists in this category.',
  },
  savedViewLimit: {
    ru: 'Достигнут лимит сохранённых видов.',
    en: 'The saved view limit has been reached.',
  },
  savedViewNotFound: {
    ru: 'Этот вид больше недоступен.',
    en: 'This view is no longer available.',
  },
  savedViewSaveFailed: {
    ru: 'Не удалось сохранить вид. Попробуйте ещё раз.',
    en: 'Could not save the view. Try again.',
  },
  savedViewLoadFailed: {
    ru: 'Не удалось загрузить сохранённые виды.',
    en: 'Could not load saved views.',
  },
  facetResults: {
    ru: 'Найдено',
    en: 'Found',
  },
  selectAllResults: {
    ru: 'Выбрать все',
    en: 'Select all',
  },
  facetNoMatches: {
    ru: 'Ничего не найдено',
    en: 'No matches',
  },
  facetStatus: {
    library: { ru: 'Сохранённые', en: 'Saved' },
    temporary: { ru: 'Черновики', en: 'Drafts' },
  },
  facetResolution: {
    compact: { ru: 'До 1280 px', en: 'Below 1280 px' },
    hd: { ru: '1280–1919 px', en: '1280–1919 px' },
    'full-hd': { ru: '1920–2559 px', en: '1920–2559 px' },
    qhd: { ru: '2560–3839 px', en: '2560–3839 px' },
    uhd: { ru: '3840 px и выше', en: '3840 px and above' },
  },
  facetDuration: {
    'under-minute': { ru: 'До минуты', en: 'Under a minute' },
    '1-5-minutes': { ru: '1–5 минут', en: '1–5 minutes' },
    '5-30-minutes': { ru: '5–30 минут', en: '5–30 minutes' },
    'over-30-minutes': { ru: 'Более 30 минут', en: 'Over 30 minutes' },
  },
  facetDate: {
    today: { ru: 'Сегодня', en: 'Today' },
    yesterday: { ru: 'Вчера', en: 'Yesterday' },
    'days-2-7': { ru: '2–7 дней назад', en: '2–7 days ago' },
    'days-8-30': { ru: '8–30 дней назад', en: '8–30 days ago' },
    'this-year': { ru: 'В этом году', en: 'This year' },
    older: { ru: 'Ранее', en: 'Older' },
  },
  facetSource: {
    screenshot: { ru: 'Скриншоты', en: 'Screenshots' },
    recording: { ru: 'Записи', en: 'Recordings' },
    'project-export': { ru: 'Экспорты проектов', en: 'Project exports' },
    'project-asset': { ru: 'Материалы проектов', en: 'Project assets' },
    'web-snapshot': { ru: 'Веб-снимки', en: 'Web snapshots' },
    scenario: { ru: 'Сценарии', en: 'Scenarios' },
    'scenario-export': { ru: 'Экспорты сценариев', en: 'Scenario exports' },
    'video-project': { ru: 'Видеопроекты', en: 'Video projects' },
  },
  exportBackup: {
    ru: 'Создать резервную копию',
    en: 'Create backup',
  },
  selectionBackup: {
    ru: 'Резервная копия',
    en: 'Backup',
  },
  selectionZip: {
    ru: 'ZIP оригиналов',
    en: 'Originals ZIP',
  },
  selectionAssetsArchiveDescription: {
    ru: 'Оригинальные файлы без метаданных Sniptale',
    en: 'Original files without Sniptale metadata',
  },
  importBackup: {
    ru: 'Восстановить из копии',
    en: 'Restore from backup',
  },
  importMediaFiles: {
    ru: 'Импортировать фото и видео',
    en: 'Import images and videos',
  },
  importSection: {
    ru: 'Импортировать',
    en: 'Import',
  },
  importWebSnapshot: {
    ru: 'Web Snapshot',
    en: 'Web Snapshot',
  },
  searchPlaceholder: {
    ru: 'Поиск',
    en: 'Search',
  },
  searchLabel: {
    ru: 'Поиск в Библиотеке',
    en: 'Search Library',
  },
  clearSearch: {
    ru: 'Очистить поиск',
    en: 'Clear search',
  },
  scopeLabel: {
    ru: 'Фильтр по типу хранения',
    en: 'Storage type filter',
  },
  selectItem: {
    ru: 'Выбрать элемент',
    en: 'Select item',
  },
  selectRecordingGroup: {
    ru: 'Выбрать всю запись',
    en: 'Select entire recording',
  },
  scenarioSearchPlaceholder: {
    ru: 'Поиск',
    en: 'Search',
  },
  sortNewest: {
    ru: 'Сначала новые',
    en: 'Newest first',
  },
  sortRecentlyModified: { ru: 'Недавно изменённые', en: 'Recently modified' },
  sortOldest: {
    ru: 'Сначала старые',
    en: 'Oldest first',
  },
  sortSize: {
    ru: 'По размеру',
    en: 'By size',
  },
  sortName: {
    ru: 'По названию',
    en: 'By name',
  },
  sortNameAsc: {
    ru: 'Имя: А–Я',
    en: 'Name: A–Z',
  },
  sortNameDesc: {
    ru: 'Имя: Я–А',
    en: 'Name: Z–A',
  },
  sortSizeDesc: {
    ru: 'Сначала крупные',
    en: 'Largest first',
  },
  scopeAll: {
    ru: 'Все элементы',
    en: 'All items',
  },
  scopeLibrary: {
    ru: 'Сохранённые',
    en: 'Saved',
  },
  scopeDrafts: {
    ru: 'Черновики',
    en: 'Drafts',
  },
  sortLabel: {
    ru: 'Сортировка',
    en: 'Sort',
  },
  refresh: {
    ru: 'Обновить',
    en: 'Refresh',
  },
  openScenarioEditor: {
    ru: 'Открыть редактор сценариев',
    en: 'Open scenario editor',
  },
  scenarioProjectsTitle: {
    ru: 'Сценарии',
    en: 'Scenarios',
  },
  scenarioProjectsEmpty: {
    ru: 'Пока нет проектов сценариев.',
    en: 'No scenario projects yet.',
  },
  openScenarioProject: {
    ru: 'Открыть',
    en: 'Open',
  },
  selectedPrefix: {
    ru: 'Выбрано:',
    en: 'Selected:',
  },
  selectionActions: {
    ru: 'Действия с выбранными элементами',
    en: 'Selected item actions',
  },
  sizePrefix: {
    ru: 'Объём:',
    en: 'Size:',
  },
  mediaArchiveDescription: {
    ru: 'Исходные файлы из Библиотеки Sniptale',
    en: 'Original files from the Sniptale Library',
  },
  selectionTagPlaceholder: {
    ru: 'Введите тег',
    en: 'Enter tag',
  },
  createTag: {
    ru: 'Создать тег',
    en: 'Create tag',
  },
  tagOptionsLabel: {
    ru: 'Доступные теги',
    en: 'Available tags',
  },
  apply: {
    ru: 'Применить',
    en: 'Apply',
  },
  addTags: {
    ru: 'Добавить теги',
    en: 'Add tags',
  },
  closeTagEditor: {
    ru: 'Закрыть добавление тегов',
    en: 'Close tag editor',
  },
  clearSelection: {
    ru: 'Снять выделение',
    en: 'Clear selection',
  },
  loading: {
    ru: 'Загрузка Библиотеки…',
    en: 'Loading Library…',
  },
  emptyTitle: {
    ru: 'Ничего не найдено',
    en: 'Nothing found',
  },
  emptyLibraryTitle: {
    ru: 'Библиотека пока пуста',
    en: 'Your Library is empty',
  },
  emptyLibraryDescription: {
    ru: 'Сделайте снимок, запишите видео или импортируйте файл — материалы появятся здесь.',
    en: 'Capture a screenshot, record a video, or import a file to see your materials here.',
  },
  emptyDescription: {
    ru: 'Измените фильтры, поисковую строку или настройки сохранения в Библиотеку.',
    en: 'Adjust filters, the search query, or library save settings.',
  },
  emptyScenarioTitle: {
    ru: 'Сценарии не найдены',
    en: 'No scenarios found',
  },
  emptyScenarioDescription: {
    ru: 'Измените поисковый запрос или создайте новый сценарий в редакторе.',
    en: 'Change the search query or create a new scenario in the editor.',
  },
  viewModeList: {
    ru: 'Список',
    en: 'List',
  },
  viewModeLabel: {
    ru: 'Режим отображения',
    en: 'View mode',
  },
  listColumnSelection: {
    ru: 'Выбор',
    en: 'Selection',
  },
  listColumnType: {
    ru: 'Тип',
    en: 'Type',
  },
  listColumnPreview: {
    ru: 'Превью',
    en: 'Preview',
  },
  listColumnSource: {
    ru: 'Источник',
    en: 'Source',
  },
  listColumnName: {
    ru: 'Название',
    en: 'Name',
  },
  listColumnTags: {
    ru: 'Теги',
    en: 'Tags',
  },
  listColumnCreated: {
    ru: 'Создано',
    en: 'Created',
  },
  listColumnSize: {
    ru: 'Размер',
    en: 'Size',
  },
  viewModeCompactGrid: {
    ru: 'Компактная сетка',
    en: 'Compact grid',
  },
  viewModeLargeGrid: {
    ru: 'Крупная сетка',
    en: 'Large grid',
  },
  updatedLabel: {
    ru: 'Обновлён:',
    en: 'Updated:',
  },
  createdLabel: {
    ru: 'Создан:',
    en: 'Created:',
  },
  scenarioStepCount: {
    ru: 'Шагов',
    en: 'Steps',
  },
  scenarioStepLabel: {
    ru: 'Шаг',
    en: 'Step',
  },
  scenarioPreviewEmpty: {
    ru: 'У этого сценария пока нет шагов с изображениями для предпросмотра.',
    en: 'This scenario has no image steps to preview yet.',
  },
  missingBlobPrefix: {
    ru: 'Не найден файл:',
    en: 'File not found:',
  },
  deleteConfirmTitle: {
    ru: 'Подтвердите удаление',
    en: 'Confirm deletion',
  },
  deleteSelectedConfirm: {
    ru: 'Удалённые материалы нельзя будет восстановить.',
    en: 'Deleted items cannot be recovered.',
  },
  deleteAffectsProjects: {
    ru: 'Файл также будет удалён из проектов:',
    en: 'The file will also be removed from these projects:',
  },
  deleteHistoryWarning: {
    ru: 'Связанные состояния истории также будут очищены. Сами проекты останутся.',
    en: 'Related history states will also be cleared. The projects will remain.',
  },
  deleteBlockedTitle: {
    ru: 'Сначала замените основной файл',
    en: 'Replace the primary file first',
  },
  deleteBlockedPrimary: {
    ru: 'Файл является обязательным исходником для проектов:',
    en: 'This file is required as the primary source for:',
  },
});
