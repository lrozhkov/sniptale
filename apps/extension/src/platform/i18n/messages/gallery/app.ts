import { defineMessageSource } from '../source';

export const galleryAppMessages = defineMessageSource({
  title: {
    ru: 'Галерея',
    en: 'Gallery',
  },
  documentTitle: {
    ru: 'Sniptale — Галерея',
    en: 'Sniptale — Gallery',
  },
  description: {
    ru: 'Все сохранённые скриншоты, видеозаписи и экспорты в одном месте.',
    en: 'All saved screenshots, recordings, and exports in one place.',
  },
  storageTitle: {
    ru: 'Хранилище',
    en: 'Storage',
  },
  storageUnavailable: {
    ru: 'Недоступно',
    en: 'Unavailable',
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
  openStorageManager: {
    ru: 'Открыть хранилище',
    en: 'Open storage',
  },
  tagsTitle: {
    ru: 'Теги',
    en: 'Tags',
  },
  tagsEmpty: {
    ru: 'Пока нет пользовательских тегов.',
    en: 'No custom tags yet.',
  },
  exportBackup: {
    ru: 'Экспортировать backup',
    en: 'Export backup',
  },
  importBackup: {
    ru: 'Импортировать backup',
    en: 'Import backup',
  },
  searchPlaceholder: {
    ru: 'Поиск по имени файла, URL, MIME, тегам или дате',
    en: 'Search by filename, URL, MIME, tags, or date',
  },
  scenarioSearchPlaceholder: {
    ru: 'Поиск по названию сценария или дате обновления',
    en: 'Search by scenario name or updated date',
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
  storageManager: {
    ru: 'Хранилище',
    en: 'Storage',
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
  selectionTagPlaceholder: {
    ru: 'Тег для batch update',
    en: 'Tag for batch update',
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
    ru: 'Загрузка медиатеки...',
    en: 'Loading media library...',
  },
  emptyTitle: {
    ru: 'Ничего не найдено',
    en: 'Nothing found',
  },
  emptyDescription: {
    ru: 'Измените фильтры, поисковую строку или настройки сохранения в Галерею.',
    en: 'Adjust filters, the search query, or gallery save settings.',
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
    ru: 'Не найден blob для',
    en: 'Blob not found for',
  },
  deleteManyPrefix: {
    ru: 'Удалить',
    en: 'Delete',
  },
  deleteManySuffix: {
    ru: 'файлов из Галереи? Это действие необратимо.',
    en: 'files from Gallery? This action cannot be undone.',
  },
  storageCleanupDeletePrefix: {
    ru: 'удалить',
    en: 'Delete',
  },
  storageCleanupDeleteMiddle: {
    ru: 'элементов и освободить около',
    en: 'items and free about',
  },
  storageCleanupDeleteSuffix: {
    ru: '?',
    en: '?',
  },
});
