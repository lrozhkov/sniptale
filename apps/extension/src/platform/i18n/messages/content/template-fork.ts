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
  discard: { ru: 'Сбросить изменения', en: 'Discard changes' },
  continueEditing: { ru: 'Продолжить настройку', en: 'Continue editing' },
  futureSettingsTitle: { ru: 'Настройки новых рамок', en: 'New frame settings' },
  futureSettingsDescription: {
    ru: 'Используйте текущие параметры для рамок, которые будут созданы после этой.',
    en: 'Use the current settings for frames created after this one.',
  },
  futureSettingsAction: {
    ru: 'Использовать для новых рамок',
    en: 'Use for new frames',
  },
  applyToFutureTitle: {
    ru: 'Использовать для новых рамок?',
    en: 'Use these settings for new frames?',
  },
  applyToFutureDescription: {
    ru: 'Настройки создания рамок в основном тулбаре будут заменены текущими. Уже созданные рамки не изменятся.',
    en: 'Frame creation settings in the main toolbar will be replaced with the current settings. Existing frames will not change.',
  },
  applyToFutureConfirm: { ru: 'Применить', en: 'Apply' },
});
