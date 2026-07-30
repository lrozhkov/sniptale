import { defineMessageSource } from '../source';
import { contentPageStyleInspectorAppearanceMessages } from './page-style-inspector-appearance';
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
  commentLabel: {
    ru: 'Комментарий к элементу',
    en: 'Element comment',
  },
  commentPlaceholder: {
    ru: 'Добавьте скрытый комментарий',
    en: 'Add a hidden comment',
  },
  commentHint: {
    ru: 'Комментарий хранится в текущей сессии и не изменяет страницу.',
    en: 'The comment stays in this session and does not modify the page.',
  },
  commentMarkerLabel: {
    ru: 'Комментарий',
    en: 'Comment',
  },
  commentCommitFailed: {
    ru: 'Не удалось сохранить комментарий. Текст сохранён в поле — попробуйте ещё раз.',
    en: 'The comment could not be saved. Your draft is still here; try again.',
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
  cssAutoPlaceholder: {
    ru: 'авто',
    en: 'auto',
  },
  cssNonePlaceholder: {
    ru: 'нет',
    en: 'none',
  },
  boxShadow: {
    ru: 'Тень',
    en: 'Shadow',
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
  disabledWithoutSelection: {
    ru: 'Выберите блок на странице',
    en: 'Select a block on the page',
  },
  close: {
    ru: 'Закрыть',
    en: 'Close',
  },
});
