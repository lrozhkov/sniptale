import { defineMessageSource } from '../source';

export const sharedStorageMessages = defineMessageSource({
  lowSpacePrefix: {
    ru: 'Недостаточно локального хранилища. Осталось',
    en: 'Not enough local storage left. Remaining',
  },
  lowSpaceMiddle: {
    ru: '.',
    en: '.',
  },
  lowSpaceSuffix: {
    ru: 'Откройте Библиотеку и освободите место.',
    en: 'Open Library and free up space.',
  },
});
