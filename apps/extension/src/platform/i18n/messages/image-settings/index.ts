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
    qualityUnavailable: {
      ru: 'Недоступно для PNG',
      en: 'Unavailable for PNG',
    },
    saving: {
      ru: 'Сохранение...',
      en: 'Saving...',
    },
    tipTitle: {
      ru: 'Подсказка',
      en: 'Tip',
    },
    formatPngDescription: {
      ru: 'Без потерь, максимальный размер',
      en: 'Lossless, maximum size',
    },
    formatJpegDescription: {
      ru: 'Сжатие с потерями, компактный',
      en: 'Lossy compression, compact',
    },
    formatWebpDescription: {
      ru: 'Современный формат, оптимальное сжатие',
      en: 'Modern format, optimal compression',
    },
    qualityLosslessDescription: {
      ru: 'PNG — формат без потерь, качество не настраивается',
      en: 'PNG is lossless, quality cannot be adjusted',
    },
    qualityLosslessShort: {
      ru: 'Без потерь',
      en: 'Lossless',
    },
    qualityHighDescription: {
      ru: 'Высокое качество, большой размер файла',
      en: 'High quality, larger file size',
    },
    qualityBalancedDescription: {
      ru: 'Оптимальный баланс качества и размера',
      en: 'Balanced quality and file size',
    },
    qualityMediumDescription: {
      ru: 'Среднее качество, компактный размер',
      en: 'Medium quality, compact size',
    },
    qualityLowDescription: {
      ru: 'Низкое качество, минимальный размер',
      en: 'Low quality, minimum file size',
    },
    tipPng: {
      ru: 'PNG — идеально для скриншотов с текстом и UI',
      en: 'PNG is ideal for screenshots with text and UI',
    },
    tipJpeg: {
      ru: 'JPEG — лучше для фотографий и сложных изображений',
      en: 'JPEG is better for photos and complex images',
    },
    tipWebp: {
      ru: 'WebP — современный формат с лучшим сжатием',
      en: 'WebP is a modern format with better compression',
    },
    tipQuality: {
      ru: 'Качество 80-90% — оптимальный баланс для JPEG/WebP',
      en: '80-90% quality is the best balance for JPEG/WebP',
    },
  },
});
