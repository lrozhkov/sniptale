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
    ru: 'Протяните область на холсте. После этого здесь появится действие применения.',
    en: 'Drag an area on the canvas. The apply action will appear here after that.',
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
