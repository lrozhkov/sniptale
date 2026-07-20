import { defineMessageSource } from '../../source';
import { editorCompactPresetMessages } from './common-presets';

export const editorCompactSharedMessages = defineMessageSource({
  color: {
    ru: 'Цвет',
    en: 'Color',
  },
  recentColors: {
    ru: 'Недавние',
    en: 'Recent',
  },
  palette: {
    ru: 'Палитра',
    en: 'Palette',
  },
  none: {
    ru: 'Нет',
    en: 'None',
  },
  choose: {
    ru: 'Выбрать',
    en: 'Choose',
  },
  redChannel: {
    ru: 'R',
    en: 'R',
  },
  greenChannel: {
    ru: 'G',
    en: 'G',
  },
  blueChannel: {
    ru: 'B',
    en: 'B',
  },
  width: {
    ru: 'Толщина',
    en: 'Width',
  },
  unitPx: {
    ru: 'px',
    en: 'px',
  },
  lineGroup: {
    ru: 'Линия',
    en: 'Line',
  },
  opacity: {
    ru: 'Прозрачность',
    en: 'Opacity',
  },
  shadowSize: {
    ru: 'Размер',
    en: 'Size',
  },
  shadowDirection: {
    ru: 'Направление',
    en: 'Direction',
  },
  shadowAngle: {
    ru: 'Угол',
    en: 'Angle',
  },
  shadowDistance: {
    ru: 'Дистанция',
    en: 'Distance',
  },
  shadowBlur: {
    ru: 'Размытие',
    en: 'Blur',
  },
  smoothingLevel: {
    ru: 'Сглаживание',
    en: 'Smoothing',
  },
  dynamicWidth: {
    ru: 'Динамическая толщина',
    en: 'Dynamic width',
  },
  shapeCorrection: {
    ru: 'Коррекция формы',
    en: 'Shape correction',
  },
  shapeCorrectionOff: {
    ru: 'Выкл',
    en: 'Off',
  },
  shapeCorrectionSubtle: {
    ru: 'Мягкая',
    en: 'Subtle',
  },
  shapeCorrectionStrong: {
    ru: 'Сильная',
    en: 'Strong',
  },
  shapePreset: {
    ru: 'Пресет рамки',
    en: 'Border preset',
  },
  shapePresetFallback: {
    ru: 'Пресет',
    en: 'Preset',
  },
  notSelected: {
    ru: 'Не выбран',
    en: 'Not selected',
  },
  dimension: {
    ru: 'Размерность',
    en: 'Dimension',
  },
  duplicate: {
    ru: 'Дублировать',
    en: 'Duplicate',
  },
  increaseAriaSuffix: {
    ru: 'увеличить',
    en: 'increase',
  },
  decreaseAriaSuffix: {
    ru: 'уменьшить',
    en: 'decrease',
  },
  linked: {
    ru: 'Связано',
    en: 'Linked',
  },
  unlocked: {
    ru: 'Свободно',
    en: 'Free',
  },
  enabledShort: {
    ru: 'Вкл',
    en: 'On',
  },
  disabledShort: {
    ru: 'Выкл',
    en: 'Off',
  },
  state: {
    ru: 'Состояние',
    en: 'State',
  },
  browserThemeMac: {
    ru: 'macOS',
    en: 'macOS',
  },
  browserPreset: {
    ru: 'Профиль браузера',
    en: 'Browser preset',
  },
  browserPresetCanonical: {
    ru: 'Chrome / Windows 11 light',
    en: 'Chrome / Windows 11 light',
  },
  browserFrameAction: {
    ru: 'Действие',
    en: 'Action',
  },
  browserFrameInsertOrUpdate: {
    ru: 'Вставить или обновить шапку',
    en: 'Insert or update header',
  },
  browserAppearanceWindow: {
    ru: 'Окно целиком',
    en: 'Full window',
  },
  browserAppearanceHeader: {
    ru: 'Только шапка',
    en: 'Header only',
  },
  frameBackgroundImageFitCover: {
    ru: 'Обрезать по рамке',
    en: 'Cover',
  },
  frameBackgroundImageFitContain: {
    ru: 'Вписать целиком',
    en: 'Contain',
  },
  frameBackgroundImageFitStretch: {
    ru: 'Растянуть',
    en: 'Stretch',
  },
  frameBackgroundImageFitTile: {
    ru: 'Плиткой',
    en: 'Tile',
  },
  frameBackgroundImageFitWidth: {
    ru: 'По ширине',
    en: 'Fit width',
  },
  frameBackgroundImageFitHeight: {
    ru: 'По высоте',
    en: 'Fit height',
  },
  chooseToolOrObject: {
    ru: 'Выберите инструмент или объект на холсте, чтобы открыть его настройки.',
    en: 'Select a tool or an object on the canvas to open its settings.',
  },
  ...editorCompactPresetMessages,
  multipleSelection: {
    ru: 'Несколько',
    en: 'Multiple',
  },
  selection: {
    ru: 'Выделение',
    en: 'Selection',
  },
  arrowHeads: {
    ru: 'Наконечники',
    en: 'Heads',
  },
  imageMetric: {
    ru: 'Изображение',
    en: 'Image',
  },
  canvasMetric: {
    ru: 'Холст',
    en: 'Canvas',
  },
});
