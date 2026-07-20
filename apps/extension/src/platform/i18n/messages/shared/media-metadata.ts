import { defineMessageSource } from '../source';

export const sharedMediaMetadataMessages = defineMessageSource({
  videoDurationReadError: {
    ru: 'Не удалось прочитать длительность медиафайла.',
    en: 'Failed to read media duration.',
  },
  imageMetadataReadError: {
    ru: 'Не удалось прочитать метаданные изображения.',
    en: 'Failed to read image metadata.',
  },
});
