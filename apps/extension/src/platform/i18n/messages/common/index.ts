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
    retry: {
      ru: 'Повторить',
      en: 'Retry',
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
  errors: {
    actionFailed: {
      ru: 'Не удалось выполнить действие.',
      en: "We couldn't complete this action.",
    },
    browserCommunicationDetail: {
      ru: 'Sniptale не смог связаться с браузером или другим компонентом расширения. Обновите страницу и повторите попытку.',
      en: 'Sniptale could not communicate with the browser or another extension component. Reload the page and try again.',
    },
    externalServiceDetail: {
      ru: 'Внешний сервис не ответил или отклонил запрос. Проверьте подключение и настройки сервиса, затем повторите попытку.',
      en: 'The external service did not respond or rejected the request. Check the connection and service settings, then try again.',
    },
    loadFailed: {
      ru: 'Не удалось загрузить данные.',
      en: 'Could not load the data.',
    },
    saveFailed: {
      ru: 'Не удалось сохранить изменения.',
      en: 'Could not save the changes.',
    },
    storageDetail: {
      ru: 'Sniptale не смог прочитать или сохранить нужные данные браузера. Проверьте доступное место и повторите попытку.',
      en: 'Sniptale could not read or save the required browser data. Check available storage and try again.',
    },
    unexpectedDetail: {
      ru: 'В Sniptale произошла непредвиденная внутренняя ошибка. Повторите попытку; если проблема сохраняется, перезагрузите страницу.',
      en: 'Sniptale encountered an unexpected internal error. Try again; if the problem continues, reload the page.',
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
    dirty: {
      ru: 'Есть изменения',
      en: 'Unsaved changes',
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
