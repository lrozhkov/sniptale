import { defineMessageSource } from '../../source';
import { editorCompactRichShapeEffectMessages } from './rich-shape-effects';
import { editorCompactRichShapeSourceMessages } from './rich-shape-source';
import { editorCompactRichShapeTailMessages } from './rich-shape-tail';

export const editorCompactRichShapeMessages = defineMessageSource({
  ...editorCompactRichShapeSourceMessages,
  richShapeGeometry: {
    ru: 'Размер и положение',
    en: 'Size and position',
  },
  richShapeArrange: {
    ru: 'Порядок',
    en: 'Arrange',
  },
  richShapeFill: {
    ru: 'Заливка',
    en: 'Fill',
  },
  richShapeLine: {
    ru: 'Линия',
    en: 'Line',
  },
  richShapeText: {
    ru: 'Текст в фигуре',
    en: 'Text in shape',
  },
  richShapeTail: {
    ru: 'Хвостик',
    en: 'Tail',
  },
  ...editorCompactRichShapeTailMessages,
  richShapeEffects: {
    ru: 'Эффекты',
    en: 'Effects',
  },
  richShapeRough: {
    ru: 'Карандашный стиль',
    en: 'Sketch style',
  },
  richShapeRoughEnabled: {
    ru: 'Карандашный рендер',
    en: 'Sketch rendering',
  },
  richShapeRoughness: {
    ru: 'Неровность',
    en: 'Roughness',
  },
  richShapeBowing: {
    ru: 'Изгиб',
    en: 'Bowing',
  },
  richShapeRoughFillStyle: {
    ru: 'Штриховка',
    en: 'Fill sketch',
  },
  richShapeHachureGap: {
    ru: 'Шаг',
    en: 'Gap',
  },
  richShapeHachureAngle: {
    ru: 'Угол штриховки',
    en: 'Hachure angle',
  },
  richShapeFillWeight: {
    ru: 'Толщина заливки',
    en: 'Fill weight',
  },
  richShapePreserveVertices: {
    ru: 'Сохранять вершины',
    en: 'Preserve vertices',
  },
  richShapeRoughFillHachure: {
    ru: 'Штрих',
    en: 'Hachure',
  },
  richShapeRoughFillSolid: {
    ru: 'Плотная',
    en: 'Solid',
  },
  richShapeRoughFillZigzag: {
    ru: 'Зигзаг',
    en: 'Zigzag',
  },
  richShapeRoughFillCrossHatch: {
    ru: 'Сетка',
    en: 'Cross hatch',
  },
  richShapeRoughFillDots: {
    ru: 'Точки',
    en: 'Dots',
  },
  richShapeRoughFillDashed: {
    ru: 'Пунктир',
    en: 'Dashed',
  },
  richShapeRoughFillZigzagLine: {
    ru: 'Линия-зигзаг',
    en: 'Zigzag line',
  },
  richShapeX: {
    ru: 'X',
    en: 'X',
  },
  richShapeY: {
    ru: 'Y',
    en: 'Y',
  },
  richShapeWidth: {
    ru: 'Ширина',
    en: 'Width',
  },
  richShapeHeight: {
    ru: 'Высота',
    en: 'Height',
  },
  richShapeRotation: {
    ru: 'Поворот',
    en: 'Rotation',
  },
  richShapeBringForward: {
    ru: 'Вперёд',
    en: 'Forward',
  },
  richShapeSendBackward: {
    ru: 'Назад',
    en: 'Backward',
  },
  richShapeFillMode: {
    ru: 'Тип заливки',
    en: 'Fill type',
  },
  richShapeFillNone: {
    ru: 'Нет',
    en: 'None',
  },
  richShapeFillSolid: {
    ru: 'Цвет',
    en: 'Solid',
  },
  richShapeFillGradient: {
    ru: 'Градиент',
    en: 'Gradient',
  },
  richShapeUnsupportedAssetFill: {
    ru: 'Изображение и паттерн будут доступны после появления asset-модели редактора.',
    en: 'Image and pattern fill will be enabled when the editor asset model owns those assets.',
  },
  richShapeTransparency: {
    ru: 'Прозрачность',
    en: 'Transparency',
  },
  richShapeGradientFrom: {
    ru: 'Начало',
    en: 'Start',
  },
  richShapeGradientTo: {
    ru: 'Конец',
    en: 'End',
  },
  richShapeGradientAngle: {
    ru: 'Угол',
    en: 'Angle',
  },
  richShapeGradientStop: {
    ru: 'Цвет',
    en: 'Stop',
  },
  richShapeGradientStopColor: {
    ru: 'Цвет',
    en: 'Color',
  },
  richShapeGradientStopOffset: {
    ru: 'Позиция',
    en: 'Position',
  },
  richShapeAddGradientStop: {
    ru: 'Добавить цвет',
    en: 'Add color',
  },
  richShapeRemoveGradientStop: {
    ru: 'Удалить цвет',
    en: 'Remove color',
  },
  richShapeMoveGradientStopUp: {
    ru: 'Поднять цвет',
    en: 'Move color up',
  },
  richShapeMoveGradientStopDown: {
    ru: 'Опустить цвет',
    en: 'Move color down',
  },
  richShapeLineCap: {
    ru: 'Окончание',
    en: 'Line cap',
  },
  richShapeLineJoin: {
    ru: 'Соединение',
    en: 'Line join',
  },
  richShapeDashDot: {
    ru: 'Штрих-точка',
    en: 'Dash dot',
  },
  richShapeLongDash: {
    ru: 'Длинный штрих',
    en: 'Long dash',
  },
  richShapeCapButt: {
    ru: 'Срез',
    en: 'Butt',
  },
  richShapeCapRound: {
    ru: 'Круглое',
    en: 'Round',
  },
  richShapeCapSquare: {
    ru: 'Квадрат',
    en: 'Square',
  },
  richShapeJoinMiter: {
    ru: 'Острое',
    en: 'Miter',
  },
  richShapeJoinRound: {
    ru: 'Круглое',
    en: 'Round',
  },
  richShapeJoinBevel: {
    ru: 'Срезанное',
    en: 'Bevel',
  },
  richShapeBeginArrowhead: {
    ru: 'Начало',
    en: 'Begin arrowhead',
  },
  richShapeEndArrowhead: {
    ru: 'Конец',
    en: 'End arrowhead',
  },
  richShapeArrowHeadStealth: {
    ru: 'Стрела',
    en: 'Stealth',
  },
  richShapeArrowHeadOval: {
    ru: 'Овал',
    en: 'Oval',
  },
  richShapeTextContent: {
    ru: 'Содержимое',
    en: 'Content',
  },
  richShapeTextInsets: {
    ru: 'Внутренние отступы',
    en: 'Text insets',
  },
  richShapeAutofit: {
    ru: 'Автоподбор',
    en: 'Autofit',
  },
  richShapeWrap: {
    ru: 'Перенос',
    en: 'Wrap',
  },
  richShapeAutofitShrink: {
    ru: 'Уменьшать текст',
    en: 'Shrink text',
  },
  richShapeAutofitResize: {
    ru: 'Менять фигуру',
    en: 'Resize shape',
  },
  richShapeWrapOverflow: {
    ru: 'Поверх',
    en: 'Overflow',
  },
  richShapeWrapClip: {
    ru: 'Обрезать',
    en: 'Clip',
  },
  ...editorCompactRichShapeEffectMessages,
});
