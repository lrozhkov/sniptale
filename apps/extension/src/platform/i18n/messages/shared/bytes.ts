import { defineMessageSource } from '../source';

export const sharedBytesMessages = defineMessageSource({
  zero: {
    ru: '0 Б',
    en: '0 B',
  },
  b: {
    ru: 'Б',
    en: 'B',
  },
  kb: {
    ru: 'КБ',
    en: 'KB',
  },
  mb: {
    ru: 'МБ',
    en: 'MB',
  },
  gb: {
    ru: 'ГБ',
    en: 'GB',
  },
  tb: {
    ru: 'ТБ',
    en: 'TB',
  },
});
