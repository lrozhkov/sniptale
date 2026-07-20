import { defineMessageSource } from '../source';

export const commonMessages = defineMessageSource({
  actions: {
    add: {
      ru: 'Добавить',
      en: 'Add',
    },
    edit: {
      ru: 'Редактировать',
      en: 'Edit',
    },
    save: {
      ru: 'Сохранить',
      en: 'Save',
    },
    cancel: {
      ru: 'Отмена',
      en: 'Cancel',
    },
    delete: {
      ru: 'Удалить',
      en: 'Delete',
    },
    close: {
      ru: 'Закрыть',
      en: 'Close',
    },
  },
  bootstrap: {
    errorBody: {
      ru: 'Страница Sniptale столкнулась с неожиданной ошибкой. Перезагрузите её и повторите попытку.',
      en: 'This Sniptale page hit an unexpected error. Reload it and try again.',
    },
    errorTitle: {
      ru: 'Не удалось загрузить страницу',
      en: 'This page failed to load',
    },
  },
  states: {
    loading: {
      ru: 'Загрузка',
      en: 'Loading',
    },
    saved: {
      ru: 'Сохранено',
      en: 'Saved',
    },
    saving: {
      ru: 'Сохраняется',
      en: 'Saving',
    },
    error: {
      ru: 'Ошибка',
      en: 'Error',
    },
    draft: {
      ru: 'Черновик',
      en: 'Draft',
    },
  },
});
