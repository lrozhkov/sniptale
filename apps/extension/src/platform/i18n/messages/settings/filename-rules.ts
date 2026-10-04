import { defineMessageSource } from '../source';
const message = (ru: string, en: string) => ({ ru, en });
export const filenameRulesMessages = defineMessageSource({
  heading: message('Имена файлов', 'File names'),
  template: message('Общий шаблон', 'Default template'),
  help: message(
    'Расширение добавляется автоматически. Пустое поле использует стандартный шаблон. Существующие и вручную заданные имена сохраняются.',
    'The extension is added automatically. An empty field uses the standard template. Existing and manually entered names are preserved.'
  ),
  overrides: message('Отдельные правила', 'Category rules'),
  inherit: message('Использовать общий шаблон', 'Use default template'),
  images: message('Изображения', 'Images'),
  recordings: message('Видео и аудио', 'Video and audio'),
  documents: message('Документы и страницы', 'Documents and pages'),
  archives: message('Архивы и резервные копии', 'Archives and backups'),
  resources: message('Настройки и ресурсы', 'Settings and resources'),
  type: message('Тип', 'Type'),
  date: message('Дата', 'Date'),
  time: message('Время', 'Time'),
  title: message('Название', 'Title'),
  index: message('Номер', 'Number'),
  tokens: message('Вставить переменную', 'Insert variable'),
  preview: message('Примеры имён', 'Filename previews'),
  invalid: message(
    'Используйте только предложенные переменные в фигурных скобках; не более 200 символов.',
    'Use only the listed variables in braces; at most 200 characters.'
  ),
  fallback: message(
    'Резервное имя: для этого примера правило неприменимо.',
    'Fallback name: the rule cannot be applied to this example.'
  ),
  save: message('Сохранить', 'Save'),
  reset: message('Восстановить стандартный', 'Restore standard'),
  unsaved: message('Есть несохранённые изменения', 'Unsaved changes'),
  saving: message('Сохранение…', 'Saving…'),
  saved: message('Сохранено', 'Saved'),
  failed: message('Не удалось сохранить. Повторите попытку.', 'Could not save. Try again.'),
});
