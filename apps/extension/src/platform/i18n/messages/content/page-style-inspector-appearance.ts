import { defineMessageSource } from '../source';

export const contentPageStyleInspectorAppearanceMessages = defineMessageSource({
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
