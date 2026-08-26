import { defineMessageSource } from '../source';

export const galleryAppMessages = defineMessageSource({
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
    ru: 'Сбросить все фильтры',
    en: 'Reset all filters',
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
  searchPlaceholder: {
    ru: 'Поиск',
    en: 'Search',
  },
  searchLabel: {
    ru: 'Поиск в Библиотеке',
    en: 'Search Library',
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
});
