import { defineMessageSource } from '../source';

/** Search, selection and the recorded-action effects master belong to the history inspector. */
export const galleryVideoReviewHistoryMessages = defineMessageSource({
  historyFilters: { ru: 'Фильтры', en: 'Filters' },
  historyFiltersActive: { ru: 'Фильтры применены', en: 'Filters applied' },
  historyType: { ru: 'Тип действия', en: 'Action type' },
  historyElement: { ru: 'Элемент', en: 'Element' },
  historyLonger: { ru: 'Дольше', en: 'Longer than' },
  historyStatus: { ru: 'Показывать', en: 'Show' },
  historySelectedOnly: { ru: 'Только выбранные действия', en: 'Selected actions only' },
  historyHiddenSelected: { ru: 'скрыто фильтром', en: 'hidden by filter' },
  historyConfigure: { ru: 'Настроить действия', en: 'Configure actions' },
  historyBack: { ru: 'К списку', en: 'Back to list' },
  historySearchClear: { ru: 'Очистить поиск', en: 'Clear search' },
  historyOpen: { ru: 'Открыть историю действий', en: 'Open action history' },
  historyEffectsEnabled: { ru: 'Применять эффекты действий', en: 'Apply action effects' },
  historyAnimatedOnly: { ru: 'Только с анимацией', en: 'Only animated actions' },
  historySearch: { ru: 'Поиск действий', en: 'Search actions' },
  historyAll: { ru: 'Все действия', en: 'All actions' },
  historyClicks: { ru: 'Щелчки', en: 'Clicks' },
  historyMore: { ru: 'Показать ещё', en: 'Show more' },
  historyEmpty: { ru: 'Нет подходящих действий', en: 'No matching actions' },
  historySelect: { ru: 'Выбрать действие', en: 'Select action' },
  historySelectAll: { ru: 'Выбрать найденные действия', en: 'Select matching actions' },
  historyClear: { ru: 'Снять выделение', en: 'Clear selection' },
  historySelected: { ru: 'Выбрано', en: 'Selected' },
  historyReset: { ru: 'Сброс истории', en: 'Reset history' },
  historyStart: { ru: 'К началу истории', en: 'Return to history start' },
  historyStartDescription: {
    ru: 'Вернуть начальное состояние этой истории. Ранее сохранённые настройки останутся; изменения можно повторить.',
    en: 'Return to this history’s initial state. Previously saved settings remain; changes can be redone.',
  },
  historyOriginalDescription: {
    ru: 'Очистить все правки и настройки видео. История будет удалена.',
    en: 'Clear all video edits and settings. Edit history will be removed.',
  },
});
