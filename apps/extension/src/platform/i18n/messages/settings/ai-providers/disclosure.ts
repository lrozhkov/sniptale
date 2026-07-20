import { defineMessageSource } from '../../source';

export const settingsAiProvidersDisclosureMessages = defineMessageSource({
  advancedTitle: {
    ru: 'Промпт по умолчанию',
    en: 'Default prompt',
  },
  advancedDescription: {
    ru: 'Общий prompt для моделей без собственного override',
    en: 'Shared prompt for models without an override',
  },
  showAdvanced: {
    ru: 'Показать',
    en: 'Show',
  },
  hideAdvanced: {
    ru: 'Скрыть',
    en: 'Hide',
  },
  globalPromptEmptySummary: {
    ru: 'Используются только model-level prompts',
    en: 'Only model-level prompts are used',
  },
  globalPromptSavedSummaryPrefix: {
    ru: 'Сохранён общий prompt, символов:',
    en: 'Shared prompt saved, characters:',
  },
});
