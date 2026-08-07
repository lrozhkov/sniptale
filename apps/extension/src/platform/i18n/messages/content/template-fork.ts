import { defineMessageSource } from '../source';

export const contentTemplateForkMessages = defineMessageSource({
  fork: { ru: 'Создать копию', en: 'Fork style' },
  backToTemplates: { ru: 'Назад к шаблонам', en: 'Back to templates' },
  temporaryStatus: { ru: 'Не сохранено', en: 'Unsaved' },
  unsavedTitle: { ru: 'Сохранить временный стиль?', en: 'Save the temporary style?' },
  unsavedDescription: {
    ru: 'Изменения применены только в текущей сессии. Сохраните их как шаблон или вернитесь к исходному стилю.',
    en: 'Changes are applied only in this session. Save them as a template or return to the original style.',
  },
  goToSave: { ru: 'Перейти к сохранению', en: 'Go to saving' },
  discard: { ru: 'Отбросить изменения', en: 'Discard changes' },
  continueEditing: { ru: 'Продолжить настройку', en: 'Continue editing' },
});
