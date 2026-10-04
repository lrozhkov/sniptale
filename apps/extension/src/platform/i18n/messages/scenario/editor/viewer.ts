import { defineMessageSource } from '../../source';

export const scenarioViewerMessages = defineMessageSource({
  viewGuideLabel: { ru: 'Руководство', en: 'Guide' },
  viewTourLabel: { ru: 'Тур', en: 'Tour' },
  viewGuide: { ru: 'Открыть руководство', en: 'Open guide' },
  viewTour: { ru: 'Запустить тур', en: 'Play tour' },
  viewSavedVersion: {
    ru: 'Сохранённая версия проекта · обновите просмотр после изменений',
    en: 'Saved project version · refresh after changes',
  },
  viewCurrentExportHint: {
    ru: 'Откроется текущий проект, а не прежний экспортированный файл.',
    en: 'Opens the current project, not the previously exported file.',
  },
  viewRefresh: { ru: 'Обновить просмотр', en: 'Refresh view' },
  viewLoading: { ru: 'Подготовка HTML…', en: 'Preparing HTML…' },
  viewUnavailable: {
    ru: 'Проект недоступен. Проверьте его в библиотеке.',
    en: 'Project unavailable. Check it in the Library.',
  },
  viewEmpty: {
    ru: 'Здесь пока нет содержимого. Откройте редактор, чтобы добавить его.',
    en: 'No content yet. Open the editor to add it.',
  },
  viewCancelled: {
    ru: 'Подготовка отменена. Обновите просмотр для повторной попытки.',
    en: 'Preparation cancelled. Refresh to try again.',
  },
  viewFailed: {
    ru: 'Не удалось подготовить HTML. Обновите просмотр или проверьте материалы в редакторе.',
    en: 'Could not prepare HTML. Refresh or check the media in the editor.',
  },
  viewFrameFailed: {
    ru: 'Не удалось открыть HTML. Обновите просмотр или подготовьте файл заново.',
    en: 'Could not open HTML. Refresh the view or prepare the file again.',
  },
});
