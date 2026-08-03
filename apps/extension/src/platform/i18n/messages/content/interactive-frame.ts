import { defineMessageSource } from '../source';

export const contentInteractiveFrameMessages = defineMessageSource({
  effectBorder: {
    ru: 'Рамка',
    en: 'Border',
  },
  openToolbar: {
    ru: 'Открыть панель действий рамки',
    en: 'Open frame actions',
  },
  effectBlur: {
    ru: 'Размытие',
    en: 'Blur',
  },
  effectFocus: {
    ru: 'Фокус',
    en: 'Focus',
  },
  effectActiveSuffix: {
    ru: ' (активен, нажмите для настроек)',
    en: ' (active, click for settings)',
  },
  stepBadgeEnabled: {
    ru: 'Нумерация включена (нажмите для настроек)',
    en: 'Numbering enabled (click for settings)',
  },
  stepBadgeEnable: {
    ru: 'Включить нумерацию шагов',
    en: 'Enable step numbering',
  },
  calloutEdit: {
    ru: 'Комментарий (нажмите для настроек)',
    en: 'Comment (click for settings)',
  },
  calloutAdd: {
    ru: 'Добавить комментарий',
    en: 'Add comment',
  },
  voiceInputStart: {
    ru: 'Начать голосовой ввод. Удерживайте кнопку, чтобы говорить только во время нажатия.',
    en: 'Start voice input. Hold the button to speak only while pressed.',
  },
  voiceInputStop: {
    ru: 'Остановить голосовой ввод',
    en: 'Stop voice input',
  },
  voiceInputError: {
    ru: 'Голосовой ввод недоступен. Проверьте микрофон и настройки голосового ввода.',
    en: 'Voice input is unavailable. Check the microphone and voice input settings.',
  },
  editButton: {
    ru: 'Редактировать',
    en: 'Edit',
  },
  decreaseFrame: {
    ru: 'Уменьшить рамку на 5 px с каждой стороны',
    en: 'Shrink frame by 5 px on each side',
  },
  increaseFrame: {
    ru: 'Увеличить рамку на 5 px с каждой стороны',
    en: 'Expand frame by 5 px on each side',
  },
  moveComment: {
    ru: 'Переместить комментарий',
    en: 'Move comment',
  },
  resizeCommentLeft: {
    ru: 'Изменить ширину комментария слева',
    en: 'Resize comment from the left',
  },
  resizeCommentRight: {
    ru: 'Изменить ширину комментария справа',
    en: 'Resize comment from the right',
  },
  calloutSettings: {
    ru: 'Настройки комментария',
    en: 'Comment settings',
  },
  stepBadgeSettings: {
    ru: 'Настройки нумерации',
    en: 'Numbering settings',
  },
  moveStepBadge: {
    ru: 'Переместить номер вдоль границы рамки',
    en: 'Move the number along the frame border',
  },
  moveCommentTail: {
    ru: 'Изменить ширину основания указателя: начальная точка',
    en: 'Adjust pointer base width: start point',
  },
  moveCommentTailBaseEnd: {
    ru: 'Изменить ширину основания указателя: конечная точка',
    en: 'Adjust pointer base width: end point',
  },
  moveCommentTailEnd: {
    ru: 'Сместить конец указателя вдоль границы рамки',
    en: 'Move the pointer end along the frame edge',
  },
  deleteButton: {
    ru: 'Удалить (Delete)',
    en: 'Delete (Delete)',
  },
  sizePanelTitle: {
    ru: 'Размер рамки',
    en: 'Frame size',
  },
  sizePanelStepPrefix: {
    ru: 'Шаг',
    en: 'Step',
  },
  maintainAspectRatio: {
    ru: 'Сохранить пропорции',
    en: 'Keep aspect ratio',
  },
  maintainAspectRatioHint: {
    ru: 'Ширина и высота меняются синхронно',
    en: 'Width and height change together',
  },
  cancelButton: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  applyButton: {
    ru: 'Применить',
    en: 'Apply',
  },
  countdownPrefix: {
    ru: 'Скриншот через',
    en: 'Screenshot in',
  },
  countdownSuffix: {
    ru: 'сек',
    en: 'sec',
  },
  cancelScreenshot: {
    ru: 'Отменить скриншот',
    en: 'Cancel screenshot',
  },
  screenshotSaved: {
    ru: 'Скриншот сохранён',
    en: 'Screenshot saved',
  },
  screenshotSaveError: {
    ru: 'Ошибка сохранения',
    en: 'Save failed',
  },
  anchorTemporarilyHidden: {
    ru: 'Элемент временно скрыт. Рамка вернётся вместе с ним',
    en: 'The element is temporarily hidden. Its frame will return with it',
  },
  anchorMissing: {
    ru: 'Связанный элемент больше не найден.',
    en: 'The linked element can no longer be found.',
  },
  anchorAmbiguous: {
    ru: 'Найдено несколько возможных элементов. Рамка не была перепривязана.',
    en: 'Several possible elements were found. The frame was not rebound.',
  },
  anchorPin: {
    ru: 'Закрепить на прежнем месте',
    en: 'Pin at previous position',
  },
  anchorDelete: {
    ru: 'Удалить',
    en: 'Delete',
  },
  anchorRecoveryCounter: {
    ru: '{current} из {total}',
    en: '{current} of {total}',
  },
  formatBold: {
    ru: 'Жирный (Ctrl+B)',
    en: 'Bold (Ctrl+B)',
  },
  formatItalic: {
    ru: 'Курсив (Ctrl+I)',
    en: 'Italic (Ctrl+I)',
  },
  formatUnderline: {
    ru: 'Подчёркнутый (Ctrl+U)',
    en: 'Underline (Ctrl+U)',
  },
});
