import { defineMessageSource } from '../source';

export const sharedEditorStartMessages = defineMessageSource({
  open: { ru: 'Открыть существующий', en: 'Open existing' },
  recent: { ru: 'Недавние материалы', en: 'Recent items' },
  empty: { ru: 'Подходящих материалов пока нет.', en: 'No compatible items yet.' },
  loading: { ru: 'Загружаем материалы…', en: 'Loading items…' },
  error: { ru: 'Не удалось загрузить материалы.', en: 'Could not load items.' },
  retry: { ru: 'Повторить', en: 'Retry' },
  search: { ru: 'Поиск материалов', en: 'Search items' },
  unavailable: { ru: 'Материал недоступен', en: 'Item unavailable' },
  openFailed: {
    ru: 'Не удалось открыть материал. Обновите список и повторите попытку.',
    en: 'Could not open the item. Refresh the list and try again.',
  },
  createFailed: {
    ru: 'Не удалось создать проект. Повторите попытку.',
    en: 'Could not create the project. Try again.',
  },
});
