import { defineMessageSource } from '../source';

export const settingsEditorMessages = defineMessageSource({
  subtitle: {
    ru: 'Шаблоны инструментов и палитры редактора изображений и рисования на странице.',
    en: 'Tool presets and palettes for the image editor and page drawing.',
  },
  toolPresetsTitle: {
    ru: 'Настройки инструментов',
    en: 'Tool settings',
  },
  toolPresetsDescription: {
    ru: 'Выберите инструмент и управляйте сохранёнными шаблонами редактора.',
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
  createInEditorHint: {
    ru: 'Новые шаблоны создаются прямо в инспекторе редактора через кнопку сохранения.',
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
  paletteDrawing: {
    ru: 'Рисование',
    en: 'Drawing',
  },
  paletteSaveError: {
    ru: 'Не удалось сохранить палитру рисования',
    en: 'Could not save the drawing palette',
  },
});
