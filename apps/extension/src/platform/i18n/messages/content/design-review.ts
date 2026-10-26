import { defineMessageSource } from '../source';
import { contentDesignReviewAppearanceMessages } from './design-review-appearance';
import { contentDesignReviewOptionMessages } from './design-review-options';

export const contentDesignReviewMessages = defineMessageSource({
  cssErrorunsupported: {
    ru: 'Свойство «{property}» не поддерживается. Используйте поддерживаемые отдельные свойства.',
    en: 'The property “{property}” is unsupported. Use supported longhand properties.',
  },
  cssErrorduplicate: {
    ru: 'Свойство «{property}» указано несколько раз. Оставьте одно значение.',
    en: 'The property “{property}” appears more than once. Keep one value.',
  },
  cssErrorvalue: {
    ru: 'Значение свойства «{property}» не поддерживается. Исправьте его и повторите.',
    en: 'The value of “{property}” is unsupported. Correct it and retry.',
  },
  computedFilter: { ru: 'Фильтр свойств', en: 'Filter properties' },
  computedCopy: { ru: 'Копировать', en: 'Copy' },
  computedCopied: { ru: 'Свойства скопированы', en: 'Properties copied' },
  computedEmpty: { ru: 'Совпадающих свойств нет', en: 'No matching properties' },
  checkViewportChanged: {
    ru: 'Viewport изменился. Результат относится к прежнему размеру; повторите проверку.',
    en: 'The viewport changed. This result uses the previous size; run Recheck.',
  },
  checkCurrentViewport: { ru: 'Текущий CSS viewport', en: 'Current CSS viewport' },
  checkUnknownVisible: {
    ru: 'Не проверено: названия / контраст / вложенные области',
    en: 'Unchecked: names / contrast / boundaries',
  },
  checkEvidenceAttribute: { ru: 'Атрибут', en: 'Attribute' },
  checkEvidenceTag: { ru: 'Элемент управления', en: 'Control' },
  checkEvidenceTabindex: { ru: 'Порядок фокуса', en: 'Focus order' },
  checkEvidenceContrast: { ru: 'Контраст / порог', en: 'Contrast / threshold' },
  checkEvidenceSize: { ru: 'Размер CSS px', en: 'Size in CSS px' },
  checkEvidenceClip: {
    ru: 'Ширина видимая / содержимого CSS px',
    en: 'Visible / content width in CSS px',
  },
  checkEvidenceOverflow: {
    ru: 'Переполнение / ширина viewport CSS px',
    en: 'Overflow / viewport width in CSS px',
  },
  checkFindingCount: { ru: 'Показано / найдено замечаний', en: 'Hints shown / found' },
  checkTitle: { ru: 'Проверить', en: 'Check' },
  checkScope: { ru: 'Область новой проверки', en: 'New scan scope' },
  checkSelected: { ru: 'Выбранный элемент и потомки', en: 'Selected subtree' },
  checkPage: { ru: 'Страница', en: 'Page' },
  checkNewScan: { ru: 'Новая проверка', en: 'New scan' },
  checkRecheck: { ru: 'Повторить проверку', en: 'Recheck' },
  checkAdvisory: {
    ru: 'Локальные подсказки для редактирования. Это не полный аудит WCAG и не дерево доступности браузера.',
    en: 'Local authoring hints. This is not a complete WCAG audit or the browser accessibility tree.',
  },
  checkUnavailable: {
    ru: 'Исходный элемент недоступен. Предыдущий результат устарел и сохранён. Повторите попытку или запустите новую проверку.',
    en: 'The original element is unavailable. The previous result is stale and retained. Retry or start a new scan.',
  },
  checkNavigationFailed: {
    ru: 'Переход не выполнен. Элемент мог стать недоступен. Повторите попытку.',
    en: 'Navigation failed. The element may be unavailable. Retry the action.',
  },
  checkShow: { ru: 'Показать', en: 'Show' },
  checkProperties: { ru: 'Свойства', en: 'Properties' },
  checkComment: { ru: 'Добавить замечание', en: 'Add feedback' },
  checkEmpty: {
    ru: 'Замечаний в проверенной области не найдено. Непроверенные случаи указаны ниже.',
    en: 'No hints found in the inspected scope. Unchecked cases are listed below.',
  },
  checkLimits: { ru: 'Границы и непроверенные случаи', en: 'Limits and unchecked cases' },
  checkVisited: { ru: 'Посещено / проверено', en: 'Visited / inspected' },
  checkViewport: { ru: 'CSS viewport результата', en: 'Result CSS viewport' },
  checkRoot: { ru: 'Исходная область', en: 'Original scope' },
  checkTruncated: {
    ru: 'Достигнут предел 1000 элементов; проверка неполная.',
    en: 'The 1000 element limit was reached; the scan is incomplete.',
  },
  checkSkipped: {
    ru: 'Скрытые / служебные / вложенные области',
    en: 'Hidden / owned / iframe and shadow boundaries',
  },
  checkUnknown: { ru: 'Неизвестно: имя / контраст', en: 'Unknown: name / contrast' },
  checkPaintLimit: {
    ru: 'Сложная заливка, прозрачность и неизвестные имена не считаются успешной проверкой. Значения полей не читаются. Малые элементы управления и выход за границы требуют оценки контекста.',
    en: 'Complex paint, transparency and unknown names are not counted as passing. Field values are not read. Small targets and overflow need contextual review.',
  },
  'checkmissing-alt': {
    ru: 'У изображения нет alt. Добавьте описание, если оно несёт смысл.',
    en: 'The image has no alt. Add a description if it conveys meaning.',
  },
  'checkmissing-name': {
    ru: 'Не найдено имя элемента управления. Проверьте подпись.',
    en: 'No control name found. Review its label.',
  },
  'checkmissing-label': {
    ru: 'Не найдена подпись поля. Проверьте связь с меткой.',
    en: 'No field label found. Review its associated label.',
  },
  'checkpositive-tabindex': {
    ru: 'Положительный tabindex меняет порядок фокуса.',
    en: 'Positive tabindex changes focus order.',
  },
  checkcontrast: {
    ru: 'Контраст текста ниже порога для текущего размера шрифта.',
    en: 'Text contrast is below the threshold for its current font size.',
  },
  'checksmall-target': {
    ru: 'Цель меньше 24 CSS px. Проверьте расстояния и исключения.',
    en: 'The target is smaller than 24 CSS px. Review spacing and exceptions.',
  },
  'checktext-clipping': {
    ru: 'Текст может обрезаться по горизонтали.',
    en: 'Text may be clipped horizontally.',
  },
  'checkhorizontal-overflow': {
    ru: 'Содержимое выходит за ширину viewport. Проверьте, предусмотрена ли прокрутка.',
    en: 'Content exceeds the viewport width. Review whether scrolling is intentional.',
  },

  reportItems: { ru: 'Замечания и правки', en: 'Feedback and changes' },
  reportImageCaption: {
    ru: 'Текущий видимый фрагмент элемента при подготовке отчёта.',
    en: 'Current visible element fragment captured when preparing this report.',
  },
  reportImageUnavailable: {
    ru: 'Снимок недоступен. Замечание и изменения сохранены.',
    en: 'Image unavailable. Feedback and changes are included.',
  },
  reportStyleChanges: { ru: 'Изменения стилей', en: 'Style changes' },
  reportProperty: { ru: 'Свойство', en: 'Property' },
  reportBefore: { ru: 'Было', en: 'Before' },
  reportAfter: { ru: 'Стало', en: 'After' },
  reportTextChanges: { ru: 'Изменения текста', en: 'Text changes' },
  reportTextMarkers: { ru: 'Подсветка текста', en: 'Text highlighting' },
  reportEmpty: { ru: 'Замечаний и правок пока нет.', en: 'No feedback or changes yet.' },
  reportFooter: { ru: 'Sniptale · Отчёт дизайн-ревью', en: 'Sniptale · Design review report' },
  typographyMore: { ru: 'Дополнительные свойства текста', en: 'More text properties' },
  cssSavedDrafts: { ru: 'Сохранённые CSS-черновики', en: 'Saved CSS drafts' },
  cssDraftBadge: { ru: 'Есть черновик', en: 'Draft available' },
  cssTargetRemoved: { ru: 'Элемент удалён', en: 'Element removed' },
  cssOtherTarget: {
    ru: 'Черновик относится к другому элементу.',
    en: 'This draft belongs to another element.',
  },
  cssVisitTarget: { ru: 'Перейти к исходному элементу', en: 'Go to the original element' },
  cssCopyDraft: { ru: 'Копировать', en: 'Copy' },
  cssDiscardDraft: { ru: 'Очистить черновик', en: 'Discard draft' },
  cssDraftCopied: { ru: 'CSS-черновик скопирован', en: 'CSS draft copied' },
  workspaceCollapse: { ru: 'Свернуть инспектор', en: 'Collapse inspector' },
  workspaceExpand: { ru: 'Развернуть инспектор', en: 'Expand inspector' },
  workspaceComment: { ru: 'Комментировать элемент', en: 'Comment on element' },
  workspaceChildren: { ru: 'Выбрать дочерний элемент', en: 'Choose child element' },
  workspaceParent: { ru: 'Выбрать родительский элемент', en: 'Select parent element' },
  workspaceNoChildren: {
    ru: 'Нет доступных дочерних элементов',
    en: 'No accessible child elements',
  },
  workspaceValueError: {
    ru: 'Изменение не применено. Проверьте значение и повторите.',
    en: 'Change was not applied. Check the value and try again.',
  },
  toolComment: { ru: 'Комментарии', en: 'Comments' },
  toolInspect: { ru: 'Инспектор', en: 'Inspector' },
  measureTreeNavigation: { ru: 'Выбор через дерево', en: 'Choose through the tree' },
  measureChooseA: { ru: 'Выбрать A', en: 'Choose A' },
  measureChooseB: { ru: 'Выбрать B', en: 'Choose B' },
  measureReplace: { ru: 'Заменить', en: 'Replace' },
  measureChoose: { ru: 'Выбрать', en: 'Choose' },
  measureClearB: { ru: 'Снять B', en: 'Clear B' },
  measureClear: { ru: 'Сбросить измерение', en: 'Reset measurement' },
  measureSwap: { ru: 'Поменять A и B', en: 'Swap A and B' },
  measurePickA: {
    ru: 'Выберите первый элемент на странице или через дерево.',
    en: 'Choose the first element on the page or through the tree.',
  },
  measurePickB: {
    ru: 'Наведите на второй элемент для предпросмотра. Нажмите, чтобы закрепить.',
    en: 'Hover the second element to preview. Click to pin it.',
  },
  measureUseCurrent: {
    ru: 'Использовать выбранный элемент как {slot}',
    en: 'Use selected element as {slot}',
  },
  measureUnavailable: { ru: 'недоступен', en: 'unavailable' },
  measureUnavailableHint: {
    ru: 'Элемент удалён или скрыт. Выберите замену для A или B.',
    en: 'An element was removed or hidden. Choose a replacement for A or B.',
  },
  measureNotChosen: { ru: 'Не выбран', en: 'Not selected' },
  measurePreview: { ru: 'предпросмотр', en: 'preview' },
  measureGapX: { ru: 'Расстояние по X', en: 'Horizontal gap' },
  measureGapY: { ru: 'Расстояние по Y', en: 'Vertical gap' },
  measureOverlapX: { ru: 'Перекрытие по X', en: 'Horizontal overlap' },
  measureOverlapY: { ru: 'Перекрытие по Y', en: 'Vertical overlap' },
  measureInsets: {
    ru: '{inner} внутри границ {outer}',
    en: '{inner} inside the bounds of {outer}',
  },
  measureInsetValues: {
    ru: 'Слева {left}, сверху {top}, справа {right}, снизу {bottom} px',
    en: 'Left {left}, top {top}, right {right}, bottom {bottom} px',
  },
  measureGeometryHint: {
    ru: 'По видимым границам, в CSS px. Это не значения margin или padding.',
    en: 'Visible border boxes in CSS px. These are not margin or padding values.',
  },
  measureSizes: { ru: 'Размеры', en: 'Dimensions' },
  measureNoDifferences: {
    ru: 'В проверяемых CSS-свойствах различий нет.',
    en: 'The compared CSS properties are equal.',
  },
  toolCompare: { ru: 'Измерить', en: 'Measure' },
  toolMove: { ru: 'Перемещение', en: 'Move' },
  toolAccessibility: { ru: 'Доступность', en: 'Accessibility' },
  toolChooseElement: { ru: 'Выберите элемент на странице.', en: 'Select an element on the page.' },
  toolCompareFirst: {
    ru: 'Выберите первый элемент для сравнения.',
    en: 'Select the first element to compare.',
  },
  toolCompareSecond: {
    ru: 'Теперь выберите второй элемент на странице.',
    en: 'Now select the second element on the page.',
  },
  toolReference: { ru: 'Первый элемент', en: 'First element' },
  toolCurrent: { ru: 'Второй элемент', en: 'Second element' },
  toolResetComparison: { ru: 'Выбрать заново', en: 'Choose again' },
  toolNoDifferences: {
    ru: 'Размеры и проверяемые стили совпадают.',
    en: 'Sizes and inspected styles match.',
  },
  cssExample: {
    ru: 'color: #243342; width: 240px;',
    en: 'color: #243342; width: 240px;',
  },
  roleOrTag: {
    ru: 'Роль / тег',
    en: 'Role / tag',
  },
  elementName: {
    ru: 'Имя',
    en: 'Name',
  },
  styleDifferences: {
    ru: 'Различия стилей',
    en: 'Style differences',
  },
  sectionTools: {
    ru: 'Инструменты',
    en: 'Tools',
  },
  freeMove: {
    ru: 'Переместить элемент',
    en: 'Move element',
  },
  moveHint: {
    ru: 'Перетаскивайте элемент на странице или этот контрол. Стрелки: 1 px, с Shift — 10 px.',
    en: 'Drag the page element or this control. Arrow keys: 1 px, Shift for 10 px.',
  },
  moveGeometryUnsupported: {
    ru: 'Перемещение недоступно для этого преобразования. Используйте инспектор.',
    en: 'Movement is unavailable for this transform. Use the inspector.',
  },
  moveUnsupported: {
    ru: 'Для перемещения задайте translate в px через CSS.',
    en: 'Set translate in px with CSS to enable movement.',
  },
  toolApplyError: {
    ru: 'Изменение не применено. Проверьте, что элемент доступен, и повторите.',
    en: 'Change could not be applied. Check that the element is available and retry.',
  },
  pinComparison: {
    ru: 'Запомнить для сравнения',
    en: 'Pin for comparison',
  },
  clearComparison: {
    ru: 'Очистить сравнение',
    en: 'Clear comparison',
  },
  directCss: {
    ru: 'Декларации CSS',
    en: 'CSS declarations',
  },
  applyCss: {
    ru: 'Применить CSS',
    en: 'Apply CSS',
  },
  cssDraftError: {
    ru: 'CSS не применён. Используйте допустимые свойства и значения без URL, var(), селекторов и !important.',
    en: 'CSS was not applied. Use supported properties and values without URLs, var(), selectors or !important.',
  },
  inspectStyles: {
    ru: 'Вычисленные стили',
    en: 'Computed styles',
  },
  accessibility: {
    ru: 'Доступность элемента',
    en: 'Element accessibility',
  },
  accessibilityScope: {
    ru: 'Локальная проверка разметки. Порядок фокуса, скринридер и контраст здесь не проверяются.',
    en: 'Local markup checks. Focus order, screen readers and contrast are not checked here.',
  },
  missingAlt: {
    ru: 'У изображения отсутствует атрибут alt.',
    en: 'Image has no alt attribute.',
  },
  unnamedControl: {
    ru: 'У элемента управления не найдено имя.',
    en: 'No name was found for this control.',
  },
  positiveTabIndex: {
    ru: 'Положительный tabindex меняет порядок клавиатурной навигации.',
    en: 'Positive tabindex changes keyboard navigation order.',
  },
  ...contentDesignReviewOptionMessages,
  ...contentDesignReviewAppearanceMessages,
  showDistances: {
    ru: 'Показать расстояния до соседних элементов',
    en: 'Show distances to sibling elements',
  },
  hideDistances: {
    ru: 'Скрыть расстояния до соседних элементов',
    en: 'Hide distances to sibling elements',
  },
  showLayoutGuides: {
    ru: 'Показать расстояния до контейнера и экрана и направляющие',
    en: 'Show container and viewport distances and guides',
  },
  hideLayoutGuides: {
    ru: 'Скрыть расстояния до контейнера и экрана и направляющие',
    en: 'Hide container and viewport distances and guides',
  },
  parentDistanceLabel: { ru: 'Контейнер', en: 'Parent' },
  viewportDistanceLabel: { ru: 'Экран', en: 'Viewport' },
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
  actionLabel: {
    ru: 'Тип замечания',
    en: 'Feedback type',
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
  selectParentElement: {
    ru: 'Выбрать родительский элемент',
    en: 'Select parent element',
  },
  selectChildElement: {
    ru: 'Выбрать дочерний элемент',
    en: 'Select child element',
  },
  navigateElementFailed: {
    ru: 'Не удалось выбрать элемент. Текущий выбор сохранён.',
    en: 'Could not select the element. The current selection is unchanged.',
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
  editText: {
    ru: 'Изменить текст элемента',
    en: 'Edit element text',
  },
  textModified: {
    ru: 'Текст изменён',
    en: 'Text edited',
  },
  resetText: {
    ru: 'Восстановить исходный текст',
    en: 'Restore original text',
  },
  textEditFailed: {
    ru: 'Не удалось сохранить текст. Предыдущие изменения сохранены.',
    en: 'Could not save the text. Previous changes are retained.',
  },
  textResetFailed: {
    ru: 'Не удалось восстановить исходный текст. Текущее содержимое сохранено.',
    en: 'Could not restore the original text. Current content is retained.',
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
