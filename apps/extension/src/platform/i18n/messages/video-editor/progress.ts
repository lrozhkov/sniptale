import { defineMessageSource } from '../source';

export const videoEditorProgressMessages = defineMessageSource({
  title: {
    ru: 'Ход экспорта',
    en: 'Export progress',
  },
  cancel: {
    ru: 'Отменить',
    en: 'Cancel',
  },
  active: {
    ru: 'Выполняется',
    en: 'In progress',
  },
});
