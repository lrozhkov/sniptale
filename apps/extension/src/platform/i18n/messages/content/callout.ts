import { defineMessageSource } from '../source';

export const contentCalloutMessages = defineMessageSource({
  settingsTitle: {
    ru: 'Настройки комментария',
    en: 'Comment settings',
  },
  presetsSection: {
    ru: 'Пресеты',
    en: 'Presets',
  },
  savePreset: {
    ru: 'Сохранить как пресет',
    en: 'Save as preset',
  },
  presetNameLabel: { ru: 'Название пресета', en: 'Preset name' },
  presetSaveError: { ru: 'Не удалось сохранить пресет', en: 'Could not save preset' },
  presetLoadError: { ru: 'Не удалось загрузить пресеты', en: 'Could not load presets' },
  presetUpdateError: { ru: 'Не удалось обновить пресет', en: 'Could not update preset' },
  presetToggleError: { ru: 'Не удалось изменить пресет', en: 'Could not change preset' },
  updatePreset: {
    ru: 'Обновить',
    en: 'Update',
  },
  enablePreset: {
    ru: 'Включить',
    en: 'Enable',
  },
  disablePreset: {
    ru: 'Скрыть',
    en: 'Hide',
  },
  customPresetName: {
    ru: 'Мой коллаут',
    en: 'My callout',
  },
  titleLabel: {
    ru: 'Заголовок коллаута',
    en: 'Callout title',
  },
  titleToggle: {
    ru: 'Заголовок',
    en: 'Title',
  },
  titleBackgroundLabel: {
    ru: 'Фон заголовка',
    en: 'Title background',
  },
  titleTextLabel: { ru: 'Текст заголовка', en: 'Title text' },
  titleFontSizeLabel: { ru: 'Размер заголовка:', en: 'Title size:' },
  radiusLabel: {
    ru: 'Скругление:',
    en: 'Corner radius:',
  },
  connectorSection: {
    ru: 'Коннектор',
    en: 'Connector',
  },
  connectorColor: {
    ru: 'Цвет линии',
    en: 'Line color',
  },
  connectorWidthLabel: { ru: 'Толщина линии:', en: 'Line width:' },
  blockMarker: {
    ru: 'Наконечник у блока',
    en: 'Block marker',
  },
  frameMarker: {
    ru: 'Наконечник у рамки',
    en: 'Frame marker',
  },
  connector: {
    none: { ru: 'Нет', en: 'None' },
    wedge: { ru: 'Хвостик', en: 'Tail' },
    line: { ru: 'Линия', en: 'Line' },
  },
  routing: {
    straight: { ru: 'Прямая', en: 'Straight' },
    elbow: { ru: 'Угловая', en: 'Elbow' },
  },
  marker: {
    none: { ru: 'Нет', en: 'None' },
    circle: { ru: 'Круг', en: 'Circle' },
    square: { ru: 'Квадрат', en: 'Square' },
    diamond: { ru: 'Ромб', en: 'Diamond' },
    arrow: { ru: 'Стрелка', en: 'Arrow' },
  },
  borderColorLabel: { ru: 'Цвет рамки', en: 'Border color' },
  borderWidthLabel: { ru: 'Толщина рамки:', en: 'Border width:' },
  paddingXLabel: { ru: 'Отступ по горизонтали:', en: 'Horizontal padding:' },
  paddingYLabel: { ru: 'Отступ по вертикали:', en: 'Vertical padding:' },
  shadowLabel: { ru: 'Тень:', en: 'Shadow:' },
  font: {
    sans: { ru: 'Sans', en: 'Sans' },
    serif: { ru: 'Serif', en: 'Serif' },
    mono: { ru: 'Mono', en: 'Mono' },
  },
  variantBubble: {
    ru: 'Облачко',
    en: 'Bubble',
  },
  variantRect: {
    ru: 'Плашка',
    en: 'Card',
  },
  variantTextOnly: {
    ru: 'Текст',
    en: 'Text',
  },
  positionSection: {
    ru: 'Позиция и сторона',
    en: 'Position and side',
  },
  sideTop: {
    ru: 'Сверху',
    en: 'Top',
  },
  sideLeft: {
    ru: 'Слева',
    en: 'Left',
  },
  sideAuto: {
    ru: 'Авто',
    en: 'Auto',
  },
  sideRight: {
    ru: 'Справа',
    en: 'Right',
  },
  sideBottom: {
    ru: 'Снизу',
    en: 'Bottom',
  },
  appearanceSection: {
    ru: 'Внешний вид',
    en: 'Appearance',
  },
  backgroundLabel: {
    ru: 'Фон',
    en: 'Background',
  },
  textLabel: {
    ru: 'Текст',
    en: 'Text',
  },
  typographySection: {
    ru: 'Типографика',
    en: 'Typography',
  },
  fontSans: {
    ru: 'Sans',
    en: 'Sans',
  },
  fontSerif: {
    ru: 'Serif',
    en: 'Serif',
  },
  fontMono: {
    ru: 'Mono',
    en: 'Mono',
  },
  boldTitle: {
    ru: 'Жирный',
    en: 'Bold',
  },
  fontSizeLabelPrefix: {
    ru: 'Размер шрифта:',
    en: 'Font size:',
  },
  maxWidthLabelPrefix: {
    ru: 'Макс. ширина:',
    en: 'Max width:',
  },
  tailSizeLabelPrefix: {
    ru: 'Размер хвостика:',
    en: 'Tail size:',
  },
  disableButton: {
    ru: 'Выключить',
    en: 'Disable',
  },
  unitPxSuffix: {
    ru: 'пкс',
    en: 'px',
  },
});
