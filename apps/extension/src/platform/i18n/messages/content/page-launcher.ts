import { defineMessageSource } from '../source';
export const pageLauncherMessages = defineMessageSource({
  open: { en: 'Open page toolbar', ru: 'Открыть панель страницы' },
  move: { en: 'Move corner group', ru: 'Переместить угловую группу' },
  actions: { en: 'Quick actions', ru: 'Быстрые действия' },
  empty: { en: 'No enabled actions', ru: 'Нет включённых действий' },
  failed: {
    en: 'Action failed. Try again.',
    ru: 'Не удалось выполнить действие. Попробуйте ещё раз.',
  },
});
