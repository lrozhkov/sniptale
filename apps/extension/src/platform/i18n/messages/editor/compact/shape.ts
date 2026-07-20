import { defineMessageSource } from '../../source';
import {
  blurStrengthMessage,
  blurTypeDistortionMessage,
  blurTypeGaussianMessage,
  blurTypeLabelMessage,
  blurTypePixelateMessage,
  blurTypeSolidMessage,
} from '../../shared/blur-controls';
import { editorCompactShapePresetMessages } from './shape-presets';

export const editorCompactShapeMessages = defineMessageSource({
  strokeColor: {
    ru: 'Цвет линии',
    en: 'Stroke color',
  },
  strokeShort: {
    ru: 'Линия',
    en: 'Stroke',
  },
  fillColor: {
    ru: 'Цвет заливки',
    en: 'Fill color',
  },
  fillShort: {
    ru: 'Заливка',
    en: 'Fill',
  },
  strokeWidth: {
    ru: 'Толщина линии',
    en: 'Stroke width',
  },
  lineColor: {
    ru: 'Цвет линии',
    en: 'Line color',
  },
  lineWidth: {
    ru: 'Толщина линии',
    en: 'Line width',
  },
  lineStyle: {
    ru: 'Стиль',
    en: 'Style',
  },
  lineStyleSolid: {
    ru: 'Сплошная',
    en: 'Solid',
  },
  lineStyleDash: {
    ru: 'Пунктир',
    en: 'Dash',
  },
  lineStyleDot: {
    ru: 'Точки',
    en: 'Dots',
  },
  lineStyleDashDot: {
    ru: 'Штрих-пунктир',
    en: 'Dash dot',
  },
  lineStyleLongDash: {
    ru: 'Длинный пунктир',
    en: 'Long dash',
  },
  lineCorners: {
    ru: 'Углы',
    en: 'Corners',
  },
  lineCornersRound: {
    ru: 'Закругленные',
    en: 'Round',
  },
  lineCornersSharp: {
    ru: 'Острые',
    en: 'Sharp',
  },
  cornerRadius: {
    ru: 'Скругление углов',
    en: 'Corner radius',
  },
  roughness: {
    ru: 'Неровность',
    en: 'Roughness',
  },
  bowing: {
    ru: 'Изгиб',
    en: 'Bowing',
  },
  lineFill: {
    ru: 'Заливка',
    en: 'Fill',
  },
  lineFillColor: {
    ru: 'Цвет',
    en: 'Color',
  },
  lineFillGradient: {
    ru: 'Градиент',
    en: 'Gradient',
  },
  lineFillRough: {
    ru: 'Карандаш',
    en: 'Sketch',
  },
  fillOpacity: {
    ru: 'Прозрачность заливки',
    en: 'Fill opacity',
  },
  gradientFrom: {
    ru: 'Цвет 1',
    en: 'Color 1',
  },
  gradientTo: {
    ru: 'Цвет 2',
    en: 'Color 2',
  },
  gradientAngle: {
    ru: 'Угол градиента',
    en: 'Gradient angle',
  },
  roughFillStyle: {
    ru: 'Тип штриховки',
    en: 'Hachure style',
  },
  roughFillGap: {
    ru: 'Шаг штриховки',
    en: 'Hachure gap',
  },
  roughFillAngle: {
    ru: 'Угол штриховки',
    en: 'Hachure angle',
  },
  arrowColor: {
    ru: 'Цвет стрелки',
    en: 'Arrow color',
  },
  arrowShort: {
    ru: 'Стрелка',
    en: 'Arrow',
  },
  arrowWidth: {
    ru: 'Толщина стрелки',
    en: 'Arrow width',
  },
  trajectory: {
    ru: 'Траектория',
    en: 'Path',
  },
  lineType: {
    ru: 'Тип линии',
    en: 'Line type',
  },
  arrowStartHead: {
    ru: 'Начало',
    en: 'Start',
  },
  arrowStartHeadSize: {
    ru: 'Размер начала',
    en: 'Start size',
  },
  arrowEndHead: {
    ru: 'Конец',
    en: 'End',
  },
  arrowEndHeadSize: {
    ru: 'Размер конца',
    en: 'End size',
  },
  arrowHeadGroup: {
    ru: 'Наконечник',
    en: 'Head',
  },
  arrowVariant: {
    ru: 'Вариант стрелки',
    en: 'Arrow variant',
  },
  arrowVariantStandard: {
    ru: 'Обычная',
    en: 'Standard',
  },
  arrowVariantTapered: {
    ru: 'Клиновидная',
    en: 'Tapered',
  },
  arrowType: {
    ru: 'Тип стрелки',
    en: 'Arrow type',
  },
  arrowTypeSharp: {
    ru: 'Острая',
    en: 'Sharp',
  },
  arrowTypeCurved: {
    ru: 'Изогнутая',
    en: 'Curved',
  },
  arrowTypeElbow: {
    ru: 'Коленчатая',
    en: 'Elbow',
  },
  arrowModeStraight: {
    ru: 'Прямая',
    en: 'Straight',
  },
  arrowModeCurve: {
    ru: 'Кривая',
    en: 'Curve',
  },
  blurAmount: blurStrengthMessage,
  blurType: blurTypeLabelMessage,
  blurEffect: {
    ru: 'Эффект',
    en: 'Effect',
  },
  blurEffectSettings: { ru: 'Настройки эффекта', en: 'Effect settings' },
  blurArea: {
    ru: 'Область',
    en: 'Area',
  },
  blurTypeGaussian: blurTypeGaussianMessage,
  blurTypeDistortion: blurTypeDistortionMessage,
  blurTypePixelate: blurTypePixelateMessage,
  blurTypeSolid: blurTypeSolidMessage,
  blurBorder: {
    ru: 'Рамка',
    en: 'Frame',
  },
  blurStrokeWidth: { ru: 'Толщина рамки', en: 'Frame width' },
  blurShowBorder: {
    ru: 'Показать',
    en: 'Show',
  },
  blurHideBorder: {
    ru: 'Скрыть',
    en: 'Hide',
  },
  ...editorCompactShapePresetMessages,
});
