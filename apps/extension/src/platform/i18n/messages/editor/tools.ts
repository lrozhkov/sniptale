import { defineMessageSource } from '../source';
import { editorToolLabelMessages } from './tool-labels';

export const editorToolsMessages = defineMessageSource({
  select: {
    ru: 'Курсор',
    en: 'Cursor',
  },
  ...editorToolLabelMessages,
  shapesAndLines: {
    ru: 'Фигуры и линии',
    en: 'Shapes and lines',
  },
  roughShape: {
    ru: 'Карандаш и фигуры',
    en: 'Sketch shapes',
  },
  shapeLibrary: {
    ru: 'Библиотека фигур',
    en: 'Shape library',
  },
  crop: {
    ru: 'Обрезка',
    en: 'Crop',
  },
});
