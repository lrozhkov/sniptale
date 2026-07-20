import { defineMessageSource } from '../source';

export const sharedRuntimeMessages = defineMessageSource({
  readBlobFailed: {
    ru: 'Не удалось прочитать Blob',
    en: 'Failed to read Blob',
  },
  thumbnailContextFailed: {
    ru: 'Не удалось создать canvas context для thumbnail',
    en: 'Failed to create canvas context for thumbnail',
  },
  cssRecognitionFailed: {
    ru: 'Не удалось распознать CSS',
    en: 'Failed to recognize CSS',
  },
  cssParseFailed: {
    ru: 'Ошибка парсинга CSS',
    en: 'CSS parse error',
  },
  pagePreparationTitle: {
    ru: 'Подготовка страницы',
    en: 'Page preparation',
  },
  screenFallbackName: {
    ru: 'Экран',
    en: 'Screen',
  },
});
