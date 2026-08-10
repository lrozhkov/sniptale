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
  },
});
