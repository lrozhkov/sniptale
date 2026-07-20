import { defineMessageSource } from '../source';

export const settingsEditorMessages = defineMessageSource({
  subtitle: {
    ru: 'Пресеты инструментов и палитра редактора изображений.',
    en: 'Tool presets and palette settings for the image editor.',
  },
  toolPresetsTitle: {
    ru: 'Настройки инструментов',
    en: 'Tool settings',
  },
  toolPresetsDescription: {
    ru: 'Выберите инструмент и управляйте сохранёнными пресетами редактора.',
    en: 'Pick a tool and manage the saved editor presets.',
  },
  paletteTitle: {
    ru: 'Настройки палитры',
    en: 'Palette settings',
  },
  paletteDescription: {
    ru: 'Цвета из этой палитры используются в инструментах и фоне сцены.',
    en: 'These palette colors are used by tools and the scene background.',
  },
  presetCountOne: {
    ru: 'пресет',
    en: 'preset',
  },
  presetCountFew: {
    ru: 'пресета',
    en: 'presets',
  },
  presetCountMany: {
    ru: 'пресетов',
    en: 'presets',
  },
  colorCountOne: {
    ru: 'цвет',
    en: 'color',
  },
  colorCountFew: {
    ru: 'цвета',
    en: 'colors',
  },
  colorCountMany: {
    ru: 'цветов',
    en: 'colors',
  },
  createInEditorHint: {
    ru: 'Новые пресеты создаются прямо в инспекторе редактора через кнопку сохранения.',
    en: 'Create new presets directly from the editor inspector with the save button.',
  },
  paletteShapeStroke: {
    ru: 'Контур фигур',
    en: 'Shape stroke',
  },
  paletteShapeFill: {
    ru: 'Заливка фигур',
    en: 'Shape fill',
  },
  paletteTextColor: {
    ru: 'Цвет текста',
    en: 'Text color',
  },
  paletteTextBackground: {
    ru: 'Фон текста',
    en: 'Text background',
  },
  paletteSceneBackground: {
    ru: 'Фон сцены',
    en: 'Scene background',
  },
});
