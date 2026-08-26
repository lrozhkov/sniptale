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
    ru: 'Удалите ненужные материалы в Библиотеке и повторите попытку.',
    en: 'Delete unneeded items in Library and try again.',
  },
});
