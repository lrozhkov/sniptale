import { defineMessageSource } from '../source';

export const validationMessages = defineMessageSource({
  schemas: {
    nameRequired: {
      ru: 'Название обязательно',
      en: 'Name is required',
    },
    max100Characters: {
      ru: 'Максимум 100 символов',
      en: 'Maximum 100 characters',
    },
    invalidUrl: {
      ru: 'Некорректный URL',
      en: 'Invalid URL',
    },
    httpsUrlRequired: {
      ru: 'Для удалённых провайдеров требуется HTTPS URL',
      en: 'HTTPS is required for remote providers',
    },
    apiKeyRequired: {
      ru: 'API ключ обязателен',
      en: 'API key is required',
    },
    selectProvider: {
      ru: 'Выберите провайдера',
      en: 'Select a provider',
    },
    modelCodeRequired: {
      ru: 'Код модели обязателен',
      en: 'Model code is required',
    },
    max200Characters: {
      ru: 'Максимум 200 символов',
      en: 'Maximum 200 characters',
    },
    max10000Characters: {
      ru: 'Максимум 10000 символов',
      en: 'Maximum 10000 characters',
    },
    max50000Characters: {
      ru: 'Максимум 50000 символов',
      en: 'Maximum 50000 characters',
    },
    presetIdRequired: {
      ru: 'ID пресета не может быть пустым',
      en: 'Preset ID cannot be empty',
    },
    minWidth320: {
      ru: 'Минимальная ширина: 320px',
      en: 'Minimum width: 320px',
    },
    maxWidth3840: {
      ru: 'Максимальная ширина: 3840px',
      en: 'Maximum width: 3840px',
    },
    minHeight240: {
      ru: 'Минимальная высота: 240px',
      en: 'Minimum height: 240px',
    },
    maxHeight2160: {
      ru: 'Максимальная высота: 2160px',
      en: 'Maximum height: 2160px',
    },
    nameTooLong: {
      ru: 'Слишком длинное название',
      en: 'Name is too long',
    },
    pathTooLong: {
      ru: 'Слишком длинный путь',
      en: 'Path is too long',
    },
    fieldIdRequired: {
      ru: 'ID поля не может быть пустым',
      en: 'Field ID cannot be empty',
    },
    fieldNameRequired: {
      ru: 'Название поля не может быть пустым',
      en: 'Field name cannot be empty',
    },
    rowIdRequired: {
      ru: 'ID строки не может быть пустым',
      en: 'Row ID cannot be empty',
    },
    tableTitleRequired: {
      ru: 'Заголовок таблицы не может быть пустым',
      en: 'Table title cannot be empty',
    },
    tableMustHaveRow: {
      ru: 'Таблица должна содержать хотя бы одну строку',
      en: 'Table must contain at least one row',
    },
    instructionRequired: {
      ru: 'Инструкция не может быть пустой',
      en: 'Instruction cannot be empty',
    },
    templateIdRequired: {
      ru: 'ID шаблона не может быть пустым',
      en: 'Template ID cannot be empty',
    },
    promptTextRequired: {
      ru: 'Текст промпта обязателен',
      en: 'Prompt text is required',
    },
  },
  runtime: {
    validationErrorPrefix: {
      ru: 'Ошибка валидации:',
      en: 'Validation error:',
    },
    jsonParseErrorPrefix: {
      ru: 'Ошибка парсинга JSON',
      en: 'JSON parse error',
    },
    unknownError: {
      ru: 'Неизвестная ошибка',
      en: 'Unknown error',
    },
  },
});
