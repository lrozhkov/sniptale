import { defineMessageSource } from '../../source';

export const editorCompactCropMessages = defineMessageSource({
  cropAreaReady: {
    ru: 'Область готова',
    en: 'Area ready',
  },
  cropAreaWaiting: {
    ru: 'Ожидает область',
    en: 'Waiting for area',
  },
  cropArea: {
    ru: 'Область обрезки',
    en: 'Crop area',
  },
  crop: {
    ru: 'Обрезка',
    en: 'Crop',
  },
  cropReadyDescription: {
    ru: 'Проверьте область обрезки на холсте и примените результат или выйдите из режима обрезки.',
    en: 'Check the crop area on the canvas and apply it, or leave crop mode.',
  },
  cropWaitingDescription: {
    ru: 'Выделите область на холсте или задайте размеры ниже.',
    en: 'Select an area on the canvas or enter dimensions below.',
  },
  cropWithinCanvas: {
    ru: 'Обрезать внутри',
    en: 'Crop within',
  },
  expandCanvas: {
    ru: 'Расширить холст',
    en: 'Expand canvas',
  },
  expandCanvasDescription: {
    ru: 'Потяните углы рамки за границу изображения или задайте новый размер. Исходное изображение останется внутри холста.',
    en: 'Drag the frame corners beyond the image or enter a new size. The original image stays inside the canvas.',
  },
  cropWithinCanvasDescription: {
    ru: 'Выделение и его маркеры упираются в текущие границы изображения.',
    en: 'The selection and its handles stop at the current image boundaries.',
  },
  cropSizeExceedsCanvas: {
    ru: 'Для размера больше текущего переключитесь на «Расширить холст».',
    en: 'Switch to Expand canvas for a size larger than the current canvas.',
  },
  applyCrop: {
    ru: 'Применить обрезку',
    en: 'Apply crop',
  },
  layerSize: {
    ru: 'Размер слоя',
    en: 'Layer size',
  },
  widthDimension: {
    ru: 'Ширина',
    en: 'Width',
  },
  heightDimension: {
    ru: 'Высота',
    en: 'Height',
  },
  keepAspectRatio: {
    ru: 'Сохранять пропорции',
    en: 'Keep aspect ratio',
  },
  applyLayerSize: {
    ru: 'Применить размер слоя',
    en: 'Apply layer size',
  },
  selectedLayerSize: {
    ru: 'Размер выбранного слоя',
    en: 'Selected layer size',
  },
});
