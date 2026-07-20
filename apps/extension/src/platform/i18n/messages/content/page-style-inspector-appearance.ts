import { defineMessageSource } from '../source';

export const contentPageStyleInspectorAppearanceMessages = defineMessageSource({
  gradientLinear: {
    ru: 'Линейный',
    en: 'Linear',
  },
  gradientStartColor: {
    ru: 'Цвет начала',
    en: 'Start color',
  },
  gradientEndColor: {
    ru: 'Цвет конца',
    en: 'End color',
  },
  gradientAngle: {
    ru: 'Угол градиента',
    en: 'Gradient angle',
  },
  backgroundFileEmpty: {
    ru: 'файл не выбран',
    en: 'no file selected',
  },
  backgroundFileSelected: {
    ru: 'выбранный файл',
    en: 'selected file',
  },
  backgroundFileClear: {
    ru: 'Удалить файл фона',
    en: 'Remove background file',
  },
  backgroundFileSaving: {
    ru: 'сохранение файла',
    en: 'saving file',
  },
  backgroundFileError: {
    ru: 'Не удалось обновить файл фона',
    en: 'Failed to update background file',
  },
  shadowEnabled: {
    ru: 'Включена',
    en: 'Enabled',
  },
  shadowOffsetX: {
    ru: 'Смещение X',
    en: 'Offset X',
  },
  shadowOffsetY: {
    ru: 'Смещение Y',
    en: 'Offset Y',
  },
  shadowBlur: {
    ru: 'Размытие',
    en: 'Blur',
  },
  shadowSpread: {
    ru: 'Размах',
    en: 'Spread',
  },
  shadowColor: {
    ru: 'Цвет тени',
    en: 'Shadow color',
  },
  unsupportedCssValue: {
    ru: 'Неподдерживаемое значение сохранено до изменения',
    en: 'Unsupported value is preserved until edited',
  },
});
