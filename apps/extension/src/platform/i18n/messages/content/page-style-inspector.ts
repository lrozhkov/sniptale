import { defineMessageSource } from '../source';
import { contentPageStyleInspectorAppearanceMessages } from './page-style-inspector-appearance';
import { contentPageStyleInspectorManagementMessages } from './page-style-inspector-management';
import { contentPageStyleInspectorOptionMessages } from './page-style-inspector-options';

export const contentPageStyleInspectorMessages = defineMessageSource({
  ...contentPageStyleInspectorOptionMessages,
  ...contentPageStyleInspectorAppearanceMessages,
  title: {
    ru: 'Свойства блока',
    en: 'Block properties',
  },
  showProperties: {
    ru: 'Показать свойства',
    en: 'Show properties',
  },
  hideProperties: {
    ru: 'Скрыть свойства',
    en: 'Hide properties',
  },
  unavailableDuringDocumentEdit: {
    ru: 'Недоступно при свободном редактировании текста',
    en: 'Unavailable during free text editing',
  },
  tabProperties: {
    ru: 'Блок',
    en: 'Block',
  },
  tabTemplates: {
    ru: 'Шаблоны',
    en: 'Templates',
  },
  tabRules: {
    ru: 'Правила',
    en: 'Rules',
  },
  emptySelectionTitle: {
    ru: 'Блок не выбран',
    en: 'No block selected',
  },
  emptySelectionHint: {
    ru: 'Выберите текст, изображение или блок на странице.',
    en: 'Select text, an image, or a block on the page.',
  },
  selectedImage: {
    ru: 'Изображение',
    en: 'Image',
  },
  selectedText: {
    ru: 'Текст',
    en: 'Text',
  },
  selectedBlock: {
    ru: 'Блок',
    en: 'Block',
  },
  noDomPath: {
    ru: 'Путь появится после выбора блока',
    en: 'Path appears after selecting a block',
  },
  computedSummary: {
    ru: 'вычислено',
    en: 'computed',
  },
  changedSummarySuffix: {
    ru: 'изменено',
    en: 'changed',
  },
  unsupportedSummary: {
    ru: 'не применимо',
    en: 'not applicable',
  },
  resetProperty: {
    ru: 'сбросить',
    en: 'reset',
  },
  sectionText: {
    ru: 'Текст',
    en: 'Text',
  },
  sectionBox: {
    ru: 'Размер и отступы',
    en: 'Size and spacing',
  },
  sectionFrame: {
    ru: 'Кадр',
    en: 'Frame',
  },
  sectionBorder: {
    ru: 'Рамка',
    en: 'Border',
  },
  sectionBackground: {
    ru: 'Фон',
    en: 'Background',
  },
  sectionAppearance: {
    ru: 'Оформление',
    en: 'Appearance',
  },
  appearanceFillGroup: {
    ru: 'Заливка',
    en: 'Fill',
  },
  appearanceBorderGroup: {
    ru: 'Рамка',
    en: 'Border',
  },
  sectionImage: {
    ru: 'Изображение',
    en: 'Image',
  },
  color: {
    ru: 'Цвет',
    en: 'Color',
  },
  fontStyle: {
    ru: 'Наклон',
    en: 'Style',
  },
  fontFamily: {
    ru: 'Шрифт',
    en: 'Font',
  },
  fontWeight: {
    ru: 'Насыщенность',
    en: 'Weight',
  },
  textDecoration: {
    ru: 'Подчеркивание',
    en: 'Decoration',
  },
  textStyleGroup: {
    ru: 'Начертание',
    en: 'Style',
  },
  fontSize: {
    ru: 'Размер',
    en: 'Size',
  },
  lineHeight: {
    ru: 'Высота строки',
    en: 'Line height',
  },
  letterSpacing: {
    ru: 'Межбуквенный',
    en: 'Letter spacing',
  },
  textAlign: {
    ru: 'Выравнивание',
    en: 'Align',
  },
  width: {
    ru: 'Ширина',
    en: 'Width',
  },
  height: {
    ru: 'Высота',
    en: 'Height',
  },
  margin: {
    ru: 'Внешние',
    en: 'Margin',
  },
  padding: {
    ru: 'Внутренние',
    en: 'Padding',
  },
  borderWidth: {
    ru: 'Толщина',
    en: 'Width',
  },
  borderStyle: {
    ru: 'Стиль',
    en: 'Style',
  },
  borderColor: {
    ru: 'Цвет рамки',
    en: 'Border color',
  },
  borderRadius: {
    ru: 'Скругление',
    en: 'Radius',
  },
  linkedSides: {
    ru: 'Связать стороны',
    en: 'Link sides',
  },
  unlinkedSides: {
    ru: 'Развязать стороны',
    en: 'Unlink sides',
  },
  sideTop: {
    ru: 'Верх',
    en: 'Top',
  },
  sideRight: {
    ru: 'Право',
    en: 'Right',
  },
  sideBottom: {
    ru: 'Низ',
    en: 'Bottom',
  },
  sideLeft: {
    ru: 'Лево',
    en: 'Left',
  },
  backgroundColor: {
    ru: 'Цвет фона',
    en: 'Background color',
  },
  backgroundImage: {
    ru: 'Градиент',
    en: 'Gradient',
  },
  backgroundImagePlaceholder: {
    ru: 'linear-gradient(...)',
    en: 'linear-gradient(...)',
  },
  cssAutoPlaceholder: {
    ru: 'авто',
    en: 'auto',
  },
  cssNonePlaceholder: {
    ru: 'нет',
    en: 'none',
  },
  backgroundAsset: {
    ru: 'Файл фона',
    en: 'Background file',
  },
  chooseFile: {
    ru: 'Выбрать',
    en: 'Choose',
  },
  replaceFile: {
    ru: 'Заменить',
    en: 'Replace',
  },
  boxShadow: {
    ru: 'Тень',
    en: 'Shadow',
  },
  replaceImage: {
    ru: 'Заменить файл',
    en: 'Replace file',
  },
  objectFit: {
    ru: 'Вписывание',
    en: 'Fit',
  },
  objectPosition: {
    ru: 'Позиция',
    en: 'Position',
  },
  objectPositionPlaceholder: {
    ru: '50% 50%',
    en: '50% 50%',
  },
  save: {
    ru: 'Сохранить',
    en: 'Save',
  },
  ...contentPageStyleInspectorManagementMessages,
  disabledWithoutSelection: {
    ru: 'Выберите блок на странице',
    en: 'Select a block on the page',
  },
  close: {
    ru: 'Закрыть',
    en: 'Close',
  },
});
