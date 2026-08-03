import { defineMessageSource } from '../source';
import { contentDesignReviewAppearanceMessages } from './design-review-appearance';
import { contentDesignReviewOptionMessages } from './design-review-options';

export const contentDesignReviewMessages = defineMessageSource({
  ...contentDesignReviewOptionMessages,
  ...contentDesignReviewAppearanceMessages,
  title: {
    ru: 'Дизайн-ревью',
    en: 'Design review',
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
  commentLabel: {
    ru: 'Комментарий к элементу',
    en: 'Element comment',
  },
  commentPlaceholder: {
    ru: 'Что нужно изменить или проверить?',
    en: 'What should be changed or checked?',
  },
  commentHint: {
    ru: 'Enter — сохранить и закрыть, Shift+Enter — новая строка.',
    en: 'Enter saves and closes; Shift+Enter starts a new line.',
  },
  voiceInputStart: {
    ru: 'Начать голосовой ввод. Удерживайте кнопку, чтобы говорить только во время нажатия.',
    en: 'Start voice input. Hold the button to speak only while pressed.',
  },
  voiceInputStop: {
    ru: 'Остановить голосовой ввод',
    en: 'Stop voice input',
  },
  voiceInputError: {
    ru: 'Голосовой ввод недоступен. Проверьте микрофон и настройки голосового ввода.',
    en: 'Voice input is unavailable. Check the microphone and voice input settings.',
  },
  markerNumberLabel: {
    ru: 'Замечание',
    en: 'Feedback',
  },
  commentCommitFailed: {
    ru: 'Не удалось сохранить комментарий. Текст сохранён в поле — попробуйте ещё раз.',
    en: 'The comment could not be saved. Your draft is still here; try again.',
  },
  resetProperty: {
    ru: 'сбросить',
    en: 'reset',
  },
  sectionText: {
    ru: 'Текст',
    en: 'Text',
  },
  sectionFrame: {
    ru: 'Размер и отступы',
    en: 'Size and spacing',
  },
  sectionBorder: {
    ru: 'Границы и скругление',
    en: 'Borders and corners',
  },
  sectionAppearance: {
    ru: 'Фон и эффекты',
    en: 'Fill and effects',
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
    ru: 'Интервал букв',
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
    ru: 'Внешние отступы',
    en: 'Margin',
  },
  padding: {
    ru: 'Внутренние отступы',
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
  actionRefine: {
    ru: 'Доработать',
    en: 'Refine',
  },
  actionFix: {
    ru: 'Исправить',
    en: 'Fix',
  },
  actionSimplify: {
    ru: 'Упростить',
    en: 'Simplify',
  },
  actionVerify: {
    ru: 'Проверить',
    en: 'Verify',
  },
  actionExplain: {
    ru: 'Объяснить',
    en: 'Explain',
  },
  copyElement: {
    ru: 'Копировать данные элемента',
    en: 'Copy element data',
  },
  pathCopied: {
    ru: 'Путь элемента скопирован',
    en: 'Element path copied',
  },
  copyFullPath: {
    ru: 'Копировать полный путь к элементу',
    en: 'Copy the full element path',
  },
  movePopover: {
    ru: 'Переместить окно замечания',
    en: 'Move the feedback window',
  },
  elementHeading: {
    ru: 'заголовок',
    en: 'heading',
  },
  elementParagraph: {
    ru: 'абзац текста',
    en: 'text paragraph',
  },
  elementLink: {
    ru: 'ссылка',
    en: 'link',
  },
  elementButton: {
    ru: 'кнопка',
    en: 'button',
  },
  elementFormControl: {
    ru: 'поле формы',
    en: 'form control',
  },
  elementImage: {
    ru: 'изображение',
    en: 'image',
  },
  elementList: {
    ru: 'список',
    en: 'list',
  },
  elementListItem: {
    ru: 'элемент списка',
    en: 'list item',
  },
  elementSection: {
    ru: 'раздел страницы',
    en: 'page section',
  },
  elementArticle: {
    ru: 'самостоятельный материал',
    en: 'standalone article',
  },
  elementNavigation: {
    ru: 'область навигации',
    en: 'navigation region',
  },
  elementMain: {
    ru: 'основное содержимое',
    en: 'main content',
  },
  elementForm: {
    ru: 'форма',
    en: 'form',
  },
  elementTable: {
    ru: 'таблица',
    en: 'table',
  },
  elementContainer: {
    ru: 'универсальный контейнер',
    en: 'generic container',
  },
  elementGeneric: {
    ru: 'HTML-элемент',
    en: 'HTML element',
  },
  elementCopied: {
    ru: 'Данные элемента скопированы',
    en: 'Element data copied',
  },
  copyFailed: {
    ru: 'Не удалось скопировать. Проверьте доступ к буферу обмена и попробуйте ещё раз.',
    en: 'Could not copy. Check clipboard access and try again.',
  },
  editProperties: {
    ru: 'Изменить свойства элемента',
    en: 'Edit element properties',
  },
  deleteFeedback: {
    ru: 'Удалить замечание',
    en: 'Delete feedback',
  },
  deleteConfirmTitle: {
    ru: 'Удалить замечание?',
    en: 'Delete feedback?',
  },
  deleteConfirmBody: {
    ru: 'Комментарий, действие и изменённые свойства элемента будут удалены.',
    en: 'The comment, action, and changed element properties will be removed.',
  },
  cancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  delete: {
    ru: 'Удалить',
    en: 'Delete',
  },
  showFeedbackPanel: {
    ru: 'Показать список замечаний',
    en: 'Show feedback list',
  },
  hideFeedbackPanel: {
    ru: 'Скрыть список замечаний',
    en: 'Hide feedback list',
  },
  panelTitle: {
    ru: 'Обратная связь',
    en: 'Feedback',
  },
  panelClose: {
    ru: 'Закрыть список замечаний',
    en: 'Close feedback list',
  },
  panelSearch: {
    ru: 'Найти замечание',
    en: 'Find feedback',
  },
  panelFilter: {
    ru: 'Фильтр по действию',
    en: 'Filter by action',
  },
  panelFilterAll: {
    ru: 'Все действия',
    en: 'All actions',
  },
  panelEmpty: {
    ru: 'Выберите элемент на странице и добавьте первое замечание.',
    en: 'Select a page element and add the first feedback item.',
  },
  panelNoResults: {
    ru: 'По этому запросу ничего не найдено.',
    en: 'No feedback matches this search.',
  },
  panelNoComment: {
    ru: 'Комментарий не добавлен',
    en: 'No comment added',
  },
  panelPropertiesChanged: {
    ru: 'Изменено свойств',
    en: 'Changed properties',
  },
  panelPage: {
    ru: 'Страница:',
    en: 'Page:',
  },
  panelClickHint: {
    ru: 'Нажмите, чтобы перейти к элементу',
    en: 'Click to go to the element',
  },
  moveMarker: {
    ru: 'Сместить маркер рядом с элементом',
    en: 'Move marker near the element',
  },
  settingsNavigation: {
    ru: 'Разделы свойств',
    en: 'Property sections',
  },
});
