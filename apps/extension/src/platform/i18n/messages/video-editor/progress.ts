import { defineMessageSource } from '../source';

export const videoEditorProgressMessages = defineMessageSource({
  title: {
    ru: 'Ход экспорта',
    en: 'Export progress',
  },
  cancel: {
    ru: 'Отменить',
    en: 'Cancel',
  },
  cancelFailed: {
    ru: 'Не удалось отменить экспорт. Он продолжается — попробуйте отменить ещё раз.',
    en: 'Could not cancel the export. It is still running — try cancelling again.',
  },
  timeEstimating: { ru: 'Оцениваем оставшееся время…', en: 'Estimating remaining time…' },
  timeRefining: { ru: 'Уточняем оставшееся время…', en: 'Updating remaining time…' },
  timeRemaining: { ru: 'Осталось', en: 'Remaining' },
  timeCompletion: { ru: 'Завершение', en: 'Finish' },
  timeTomorrow: { ru: 'завтра', en: 'tomorrow' },
  timeHour: { ru: 'ч', en: 'h' },
  timeMinute: { ru: 'мин', en: 'min' },
  timeSecond: { ru: 'с', en: 's' },
  preparing: { ru: 'Подготовка видео', en: 'Preparing video' },
  rendering: { ru: 'Создание видео', en: 'Rendering video' },
  transcoding: { ru: 'Сборка файла', en: 'Finalizing file' },
  saving: { ru: 'Сохранение файла', en: 'Saving file' },
  done: { ru: 'Видео готово', en: 'Video ready' },
  failed: { ru: 'Экспорт не удался', en: 'Export failed' },
  cancelled: { ru: 'Экспорт отменён', en: 'Export cancelled' },
});
