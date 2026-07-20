import { defineMessageSource } from '../../source';

export const editorCompactShapePresetMessages = defineMessageSource({
  arrowHeadNone: {
    ru: 'Нет',
    en: 'None',
  },
  arrowHeadArrow: {
    ru: 'Стрелка',
    en: 'Arrow',
  },
  arrowHeadTriangle: {
    ru: 'Треугольник',
    en: 'Triangle',
  },
  arrowHeadTriangleOutline: {
    ru: 'Треугольник контур',
    en: 'Triangle outline',
  },
  arrowHeadBar: {
    ru: 'Засечка',
    en: 'Bar',
  },
  arrowHeadDiamond: {
    ru: 'Ромб',
    en: 'Diamond',
  },
  arrowHeadDiamondOutline: {
    ru: 'Ромб контур',
    en: 'Diamond outline',
  },
  arrowHeadCircle: {
    ru: 'Круг',
    en: 'Circle',
  },
  arrowHeadCircleOutline: {
    ru: 'Круг контур',
    en: 'Circle outline',
  },
  arrowHeadCrosshairCircle: {
    ru: 'Круг с крестом',
    en: 'Crosshair circle',
  },
  arrowHeadOpen: {
    ru: 'Открытый',
    en: 'Open',
  },
  arrowHeadBlock: {
    ru: 'Скругленный',
    en: 'Rounded',
  },
  shapePresetShort: {
    ru: 'Пресет',
    en: 'Preset',
  },
  saveShapePreset: {
    ru: 'Сохранить как пресет рамки',
    en: 'Save as border preset',
  },
  shapeCustomCssBoundaryHint: {
    ru: 'Additional CSS сохраняется в пресете и применяется только в content runtime, не на canvas редактора.',
    en: 'Additional CSS is saved with the preset and applies only in content runtime, not on the editor canvas.',
  },
  saveShapePresetSaved: {
    ru: 'Пресет рамки сохранён',
    en: 'Border preset saved',
  },
  saveShapePresetFailed: {
    ru: 'Не удалось сохранить пресет рамки',
    en: 'Could not save border preset',
  },
  editorRectanglePresetName: {
    ru: 'Прямоугольник из редактора',
    en: 'Editor rectangle',
  },
});
