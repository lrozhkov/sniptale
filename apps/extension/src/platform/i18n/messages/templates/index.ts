import { defineMessageSource } from '../source';

export const templatesMessages = defineMessageSource({
  section: {
    title: {
      ru: 'Шаблоны промптов',
      en: 'Prompt templates',
    },
    subtitle: {
      ru: 'Готовые промпты для быстрой обработки скриншотов через AI',
      en: 'Reusable prompts for faster screenshot processing with AI',
    },
    savedLabel: {
      ru: 'Сохранённые шаблоны',
      en: 'Saved templates',
    },
    emptyTitle: {
      ru: 'Нет сохранённых шаблонов',
      en: 'No saved templates',
    },
    emptyDescription: {
      ru: 'Создайте шаблон для быстрой обработки скриншотов',
      en: 'Create a template for faster screenshot processing',
    },
    addButton: {
      ru: 'Добавить шаблон',
      en: 'Add template',
    },
    deleteDefaultTitle: {
      ru: 'Удалить стандартный шаблон?',
      en: 'Delete default template?',
    },
    deleteCustomTitle: {
      ru: 'Удалить шаблон?',
      en: 'Delete template?',
    },
    deleteMessagePrefix: {
      ru: 'Вы уверены, что хотите удалить шаблон',
      en: 'Are you sure you want to delete the template',
    },
    deleteMessageSuffix: {
      ru: '?',
      en: '?',
    },
    countOne: {
      ru: 'шаблон',
      en: 'template',
    },
    countFew: {
      ru: 'шаблона',
      en: 'templates',
    },
    countMany: {
      ru: 'шаблонов',
      en: 'templates',
    },
  },
  editor: {
    editTitle: {
      ru: 'Редактировать шаблон',
      en: 'Edit template',
    },
    newTitle: {
      ru: 'Новый шаблон',
      en: 'New template',
    },
    nameLabel: {
      ru: 'Название *',
      en: 'Name *',
    },
    namePlaceholder: {
      ru: 'Например: Перевод',
      en: 'Example: Translation',
    },
    contentLabel: {
      ru: 'Текст промпта *',
      en: 'Prompt text *',
    },
    contentPlaceholder: {
      ru: 'Опишите, что должен сделать AI...',
      en: 'Describe what the AI should do...',
    },
    closeTitle: {
      ru: 'Закрыть (Escape)',
      en: 'Close (Escape)',
    },
    nameRequired: {
      ru: 'Название обязательно',
      en: 'Name is required',
    },
    nameTooLong: {
      ru: 'Слишком длинное название',
      en: 'Name is too long',
    },
    contentRequired: {
      ru: 'Текст промпта обязателен',
      en: 'Prompt text is required',
    },
  },
  messages: {
    deleted: {
      ru: 'Шаблон удалён',
      en: 'Template deleted',
    },
    updated: {
      ru: 'Шаблон обновлён',
      en: 'Template updated',
    },
    created: {
      ru: 'Шаблон создан',
      en: 'Template created',
    },
    deleteErrorSuffix: {
      ru: ' удаления шаблона',
      en: ' deleting the template',
    },
    saveErrorSuffix: {
      ru: ' сохранения шаблона',
      en: ' saving the template',
    },
  },
});
