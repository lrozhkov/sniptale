import { defineMessageSource } from '../../source';

/** Save durability and project-operation recovery copy share the page feedback surface. */
export const scenarioEditorFeedbackMessages = defineMessageSource({
  guideCopyFailed: {
    ru: 'Не удалось создать копию. Проверьте доступное место и повторите. Исходные правки остались в редакторе.',
    en: 'Could not create a copy. Check available space and retry. Your original edits remain in the editor.',
  },
  guideDeleteFailed: {
    ru: 'Не удалось удалить проект. Повторите попытку.',
    en: 'Could not delete the project. Try again.',
  },
  guideReload: { ru: 'Перезагрузить проект', en: 'Reload project' },
  guideReloadFailed: {
    ru: 'Не удалось загрузить сохранённую версию. Текущий документ остался в редакторе. Повторите загрузку.',
    en: 'Could not load the saved version. The current document remains in the editor. Try reloading again.',
  },
  guideOperationDocumentSaved: {
    ru: 'Документ сохранён. Ошибка относится только к указанной операции.',
    en: 'The document is saved. Only the operation above failed.',
  },
  guideReloadMessage: {
    ru: 'Заменить текущие правки сохранённой версией? Несохранённые изменения будут потеряны. Чтобы оставить их, сначала создайте копию.',
    en: 'Replace your current edits with the saved version? Unsaved changes will be lost. Duplicate the project first to keep them.',
  },
  guideSaving: { ru: 'Сохранение…', en: 'Saving…' },
  guideSaved: { ru: 'Сохранено', en: 'Saved' },
  guideDirty: { ru: 'Есть несохранённые изменения', en: 'Unsaved changes' },
  guideConflict: {
    ru: 'Проект изменён в другой вкладке. Ваши правки сохранены в редакторе; запись остановлена, чтобы не перезаписать изменения.',
    en: 'This project changed in another tab. Your edits remain in the editor; saving is stopped to avoid overwriting changes.',
  },
  guideFailed: {
    ru: 'Не удалось сохранить. Изменения остались в редакторе. Повторите сохранение.',
    en: 'Could not save. Your edits remain in the editor. Try saving again.',
  },
  guideUnavailable: {
    ru: 'Этот сценарий недоступен в текущем редакторе. Вернитесь в библиотеку или повторите загрузку.',
    en: 'This guide is unavailable in this editor. Return to the library or retry loading.',
  },
  guideMissing: { ru: 'Сценарий не найден.', en: 'Guide not found.' },
  guideRetry: { ru: 'Повторить загрузку', en: 'Retry loading' },
});
