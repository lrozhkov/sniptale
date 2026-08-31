import { defineMessageSource } from '../source';

export const imageSettingsMessages = defineMessageSource({
  section: {
    title: {
      ru: 'Настройки изображений',
      en: 'Image settings',
    },
    subtitle: {
      ru: 'Формат и качество экспортируемых скриншотов',
      en: 'Format and quality of exported screenshots',
    },
    formatLabel: {
      ru: 'Формат изображения',
      en: 'Image format',
    },
    formatPngLabel: {
      ru: 'PNG',
      en: 'PNG',
    },
    formatJpegLabel: {
      ru: 'JPEG',
      en: 'JPEG',
    },
    formatWebpLabel: {
      ru: 'WebP',
      en: 'WebP',
    },
    qualityLabel: {
      ru: 'Качество изображения',
      en: 'Image quality',
    },
    fullPageTitle: {
      ru: 'Полноразмерные снимки',
      en: 'Full-page screenshots',
    },
    fullPageDescription: {
      ru: 'Повышенные значения дают более чёткие снимки длинных страниц, но требуют больше памяти и могут снизить стабильность браузера.',
      en: 'Higher values keep long pages sharper, but use more memory and may reduce browser stability.',
    },
    fullPageProfileLabel: { ru: 'Профиль', en: 'Profile' },
    fullPageProfileSafe: { ru: 'Безопасный', en: 'Safe' },
    fullPageProfileHighQuality: { ru: 'Высокое качество', en: 'High quality' },
    fullPageProfileMaximum: { ru: 'Максимальное', en: 'Maximum' },
    fullPageProfileCustom: { ru: 'Пользовательский', en: 'Custom' },
    fullPageMaxSize: {
      ru: 'Максимальный размер полноразмерного снимка, Мп',
      en: 'Maximum full-page screenshot size, MP',
    },
    fullPageMinScale: {
      ru: 'Минимальный масштаб длинной страницы',
      en: 'Minimum long-page scale',
    },
    fullPageMaxFileSize: {
      ru: 'Максимальный размер файла, МиБ',
      en: 'Maximum file size, MiB',
    },
    fullPageInvalidValue: {
      ru: 'Введите значение в указанном безопасном диапазоне.',
      en: 'Enter a value within the shown safe range.',
    },
    fullPageSaveFailed: {
      ru: 'Не удалось сохранить настройку. Попробуйте ещё раз.',
      en: 'The setting could not be saved. Try again.',
    },
  },
});
