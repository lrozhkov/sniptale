import { defineMessageSource } from '../source';

export const contentInteractiveFrameMessages = defineMessageSource({
  effectBorder: {
    ru: 'Рамка',
    en: 'Border',
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
  editButton: {
    ru: 'Редактировать',
    en: 'Edit',
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
