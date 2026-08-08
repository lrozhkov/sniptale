import { defineMessageSource } from '../source';
import {
  blurStrengthMessage,
  blurTypeDistortionMessage,
  blurTypeGaussianMessage,
  blurTypeLabelMessage,
  blurTypePixelateMessage,
  blurTypeSolidMessage,
} from '../shared/blur-controls';

export const highlighterMessages = defineMessageSource({
  exportOptimizedSize: {
    ru: 'Изображение сохранено в оптимизированном размере',
    en: 'The image was saved at an optimized size',
  },
  stepBadgePresets: {
    system: {
      classic: { ru: 'Классический', en: 'Classic' },
      outline: { ru: 'Контурный', en: 'Outline' },
      compact: { ru: 'Компактный', en: 'Compact' },
      large: { ru: 'Крупный', en: 'Large' },
      letters: { ru: 'Буквенный', en: 'Letters' },
    },
    title: { ru: 'Шаблоны нумерации', en: 'Numbering templates' },
    description: {
      ru: 'Настраивайте, скрывайте и расставляйте варианты нумерации рамок.',
      en: 'Customize, hide, and reorder reusable frame numbering styles.',
    },
    add: { ru: 'Добавить шаблон', en: 'Add template' },
    defaultBadge: { ru: 'По умолчанию', en: 'Default' },
    systemBadge: { ru: 'Системный', en: 'System' },
    makeDefault: { ru: 'Сделать основным', en: 'Make default' },
    toggle: { ru: 'Показывать в списке', en: 'Show in list' },
    lastEnabled: {
      ru: 'Должен остаться один шаблон',
      en: 'At least one template must remain enabled',
    },
    reset: { ru: 'Восстановить системный вариант', en: 'Restore system template' },
    delete: { ru: 'Удалить шаблон', en: 'Delete template' },
    editor: {
      newTitle: { ru: 'Новый шаблон нумерации', en: 'New numbering template' },
      editTitle: { ru: 'Изменить шаблон нумерации', en: 'Edit numbering template' },
      name: { ru: 'Название', en: 'Name' },
    },
    messages: {
      loadError: {
        ru: 'Не удалось загрузить шаблоны нумерации',
        en: 'Could not load numbering templates',
      },
      saveError: {
        ru: 'Не удалось сохранить шаблоны нумерации',
        en: 'Could not save numbering templates',
      },
      created: { ru: 'Шаблон создан', en: 'Template created' },
      updated: { ru: 'Шаблон обновлён', en: 'Template updated' },
      deleted: { ru: 'Шаблон удалён', en: 'Template deleted' },
      reset: { ru: 'Системный шаблон восстановлен', en: 'System template restored' },
    },
  },
  calloutPresets: {
    system: {
      bubble: { ru: 'Облачко', en: 'Bubble' },
      card: { ru: 'Плашка', en: 'Card' },
      text: { ru: 'Текст', en: 'Text' },
      pointerNote: { ru: 'Точечная сноска', en: 'Pinpoint note' },
      headerCard: { ru: 'Инфо-карточка', en: 'Info card' },
      framedNote: { ru: 'Предупреждение', en: 'Warning note' },
    },
    title: { ru: 'Шаблоны комментариев', en: 'Comment templates' },
    description: {
      ru: 'Настраивайте, скрывайте и расставляйте варианты коллаутов.',
      en: 'Customize, hide, and reorder reusable callout designs.',
    },
    add: { ru: 'Добавить шаблон', en: 'Add template' },
    defaultBadge: { ru: 'По умолчанию', en: 'Default' },
    systemBadge: { ru: 'Системный', en: 'System' },
    makeDefault: { ru: 'Сделать основным', en: 'Make default' },
    toggle: { ru: 'Показывать в списке', en: 'Show in list' },
    lastEnabled: {
      ru: 'Должен остаться один шаблон',
      en: 'At least one template must remain enabled',
    },
    reset: { ru: 'Восстановить системный вариант', en: 'Restore system template' },
    connector: {
      none: { ru: 'Без коннектора', en: 'No connector' },
      wedge: { ru: 'Хвостик', en: 'Tail' },
      line: { ru: 'Линия', en: 'Line' },
    },
    editor: {
      newTitle: { ru: 'Новый шаблон комментария', en: 'New comment template' },
      editTitle: { ru: 'Изменить шаблон комментария', en: 'Edit comment template' },
      name: { ru: 'Название', en: 'Name' },
      defaultPosition: { ru: 'Позиция по умолчанию', en: 'Default position' },
      surface: { ru: 'Поверхность', en: 'Surface' },
      background: { ru: 'Фон', en: 'Background' },
      text: { ru: 'Текст', en: 'Text' },
      border: { ru: 'Рамка', en: 'Border' },
      radius: { ru: 'Скругление', en: 'Radius' },
      borderWidth: { ru: 'Толщина рамки', en: 'Border width' },
      paddingX: { ru: 'Отступ по горизонтали', en: 'Horizontal padding' },
      paddingY: { ru: 'Отступ по вертикали', en: 'Vertical padding' },
      shadow: { ru: 'Тень', en: 'Shadow' },
      shadowColor: { ru: 'Цвет тени', en: 'Shadow color' },
      connector: { ru: 'Коннектор', en: 'Connector' },
      connectorKind: { ru: 'Тип', en: 'Type' },
      connectorColor: { ru: 'Цвет', en: 'Color' },
      connectorWidth: { ru: 'Толщина', en: 'Width' },
      wedgeSize: { ru: 'Размер хвостика', en: 'Tail size' },
      routing: { ru: 'Маршрут', en: 'Routing' },
      routingStraight: { ru: 'Прямой', en: 'Straight' },
      routingElbow: { ru: 'Угловой', en: 'Elbow' },
      frameMarker: { ru: 'Наконечник у рамки', en: 'Frame marker' },
      frameMarkerSize: { ru: 'Размер у рамки', en: 'Frame marker size' },
      blockMarker: { ru: 'Наконечник у блока', en: 'Block marker' },
      blockMarkerSize: { ru: 'Размер у блока', en: 'Block marker size' },
      marker: {
        none: { ru: 'Без маркера', en: 'None' },
        circle: { ru: 'Круг', en: 'Circle' },
        ringDot: { ru: 'Кольцо с точкой', en: 'Ring with dot' },
        square: { ru: 'Квадрат', en: 'Square' },
        diamond: { ru: 'Ромб', en: 'Diamond' },
        arrow: { ru: 'Стрелка', en: 'Arrow' },
      },
      typography: { ru: 'Типографика и заголовок', en: 'Typography and title' },
      fontFamily: { ru: 'Семейство шрифта', en: 'Font family' },
      font: {
        sans: { ru: 'Без засечек', en: 'Sans' },
        serif: { ru: 'С засечками', en: 'Serif' },
        mono: { ru: 'Моноширинный', en: 'Mono' },
      },
      fontSize: { ru: 'Размер шрифта', en: 'Font size' },
      bold: { ru: 'Жирный', en: 'Bold' },
      italic: { ru: 'Курсив', en: 'Italic' },
      underline: { ru: 'Подчёркнутый', en: 'Underline' },
      defaultWidth: { ru: 'Ширина по умолчанию', en: 'Default width' },
      title: { ru: 'Заголовок', en: 'Title' },
      titleBackground: { ru: 'Фон заголовка', en: 'Title background' },
      titleText: { ru: 'Текст заголовка', en: 'Title text' },
      titleFontSize: { ru: 'Размер заголовка', en: 'Title size' },
    },
    messages: {
      loadError: {
        ru: 'Не удалось загрузить шаблоны комментариев',
        en: 'Could not load comment templates',
      },
      saveError: {
        ru: 'Не удалось сохранить шаблоны комментариев',
        en: 'Could not save comment templates',
      },
      created: { ru: 'Шаблон создан', en: 'Template created' },
      updated: { ru: 'Шаблон обновлён', en: 'Template updated' },
      deleted: { ru: 'Шаблон удалён', en: 'Template deleted' },
      reset: { ru: 'Системный шаблон восстановлен', en: 'System template restored' },
      defaultUpdated: { ru: 'Шаблон по умолчанию изменён', en: 'Default template updated' },
    },
  },
  systemPresets: {
    accent: { ru: 'Акцент', en: 'Accent' },
    softHighlight: { ru: 'Мягкое выделение', en: 'Soft highlight' },
    marker: { ru: 'Маркер', en: 'Marker' },
    done: { ru: 'Готово', en: 'Done' },
    attention: { ru: 'Внимание', en: 'Attention' },
    review: { ru: 'Ревью', en: 'Review' },
    lightUi: { ru: 'Для светлого интерфейса', en: 'For light UI' },
    darkUi: { ru: 'Для тёмного интерфейса', en: 'For dark UI' },
  },
  section: {
    title: {
      ru: 'Режим выделения',
      en: 'Highlight mode',
    },
    subtitle: {
      ru: 'Настройка внешнего вида рамок выделения',
      en: 'Configure the appearance of selection borders',
    },
    loadErrorSuffix: {
      ru: ' загрузки настроек',
      en: ' loading settings',
    },
    defaultUpdated: {
      ru: 'Шаблон по умолчанию изменён',
      en: 'Default template updated',
    },
    systemPresetDeleteError: {
      ru: 'Системный шаблон нельзя удалить',
      en: 'System template cannot be deleted',
    },
    lastPresetDeleteError: {
      ru: 'Нельзя удалить последний шаблон',
      en: 'Cannot delete the last template',
    },
    presetDeleted: {
      ru: 'Шаблон удалён',
      en: 'Template deleted',
    },
    presetUpdated: {
      ru: 'Шаблон обновлён',
      en: 'Template updated',
    },
    presetCreated: {
      ru: 'Шаблон создан',
      en: 'Template created',
    },
    templateHidden: {
      ru: 'Шаблон скрыт из списка',
      en: 'Template hidden from the list',
    },
    templateShown: {
      ru: 'Шаблон отображается в списке',
      en: 'Template shown in the list',
    },
    saveErrorSuffix: {
      ru: ' сохранения',
      en: ' saving',
    },
    deleteErrorSuffix: {
      ru: ' удаления',
      en: ' deleting',
    },
    reorderErrorSuffix: {
      ru: ' изменения порядка',
      en: ' reordering',
    },
    presetsLabel: {
      ru: 'Шаблоны рамок',
      en: 'Border templates',
    },
    countOne: {
      ru: 'шаблон',
      en: 'template',
    },
    countFew: {
      ru: 'шаблона',
      en: 'templates',
    },
    countMany: {
      ru: 'шаблонов',
      en: 'templates',
    },
    defaultBadge: {
      ru: 'По умолчанию',
      en: 'Default',
    },
    systemBadge: {
      ru: 'Системный',
      en: 'System',
    },
    makeDefaultTitle: {
      ru: 'Сделать по умолчанию',
      en: 'Make default',
    },
    systemPresetEditDisabled: {
      ru: 'Системный шаблон нельзя редактировать',
      en: 'System template cannot be edited',
    },
    systemPresetDeleteDisabled: {
      ru: 'Системный шаблон нельзя удалить',
      en: 'System template cannot be deleted',
    },
    lastEnabledPresetDisabled: {
      ru: 'Должен остаться хотя бы один включённый шаблон',
      en: 'At least one template must remain enabled',
    },
    resetSystemPresetTitle: {
      ru: 'Восстановить заводской вариант',
      en: 'Restore factory template',
    },
    presetReset: {
      ru: 'Заводской вариант восстановлен',
      en: 'Factory template restored',
    },
    addButton: {
      ru: 'Добавить шаблон',
      en: 'Add template',
    },
    radiusSuffix: {
      ru: 'радиус',
      en: 'radius',
    },
    unitPxSuffix: {
      ru: 'пкс',
      en: 'px',
    },
    blurTitle: {
      ru: 'Настройки размытия (Blur)',
      en: 'Blur settings',
    },
    blurAmountLabel: blurStrengthMessage,
    blurTypeLabel: blurTypeLabelMessage,
    blurTypeGaussian: blurTypeGaussianMessage,
    blurTypeDistortion: blurTypeDistortionMessage,
    blurTypePixelate: blurTypePixelateMessage,
    blurTypeSolid: blurTypeSolidMessage,
    showBorderLabel: {
      ru: 'Показывать границу',
      en: 'Show border',
    },
    focusTitle: {
      ru: 'Настройки фокуса (Focus)',
      en: 'Focus settings',
    },
    focusOpacityLabel: {
      ru: 'Затемнение маски',
      en: 'Mask dimming',
    },
    focusOpacityHint: {
      ru: 'Чем выше значение, тем темнее область вне рамки',
      en: 'Higher values make the outside area darker',
    },
    focusBlurLabel: {
      ru: 'Размытие области',
      en: 'Area blur',
    },
    focusBlurHint: {
      ru: 'Гауссово размытие области вне рамки',
      en: 'Gaussian blur outside the frame',
    },
  },
  editor: {
    outlineSection: { ru: 'Контур', en: 'Outline' },
    fillSection: { ru: 'Заливка', en: 'Fill' },
    geometrySection: { ru: 'Геометрия', en: 'Geometry' },
    shadowSection: { ru: 'Тень', en: 'Shadow' },
    blurSection: { ru: 'Размытие (по умолчанию)', en: 'Blur defaults' },
    focusSection: { ru: 'Фокус (по умолчанию)', en: 'Focus defaults' },
    behaviorSection: { ru: 'Поведение', en: 'Behavior' },
    blurStrengthLabel: { ru: 'Сила', en: 'Strength' },
    blurTypeLabel: { ru: 'Тип размытия', en: 'Blur type' },
    blurTypeGaussian: blurTypeGaussianMessage,
    blurTypeDistortion: blurTypeDistortionMessage,
    blurTypePixelate: blurTypePixelateMessage,
    blurTypeSolid: blurTypeSolidMessage,
    focusDimmingLabel: { ru: 'Затемнение', en: 'Dimming' },
    focusBlurLabel: { ru: 'Размытие', en: 'Blur' },
    captureDefaultsTitle: { ru: 'Снимок (по умолчанию)', en: 'Capture defaults' },
    hideFrameDuringCaptureLabel: {
      ru: 'Скрывать рамку во время снимка',
      en: 'Hide frame during capture',
    },
    linkedTemplatesTitle: { ru: 'Связанные шаблоны', en: 'Linked templates' },
    linkedCalloutTemplateLabel: {
      ru: 'Комментарий',
      en: 'Comment',
    },
    linkedStepBadgeTemplateLabel: {
      ru: 'Нумерация',
      en: 'Numbering',
    },
    linkedTemplateNone: { ru: 'Не выбран', en: 'Not selected' },
    saveSection: { ru: 'Сохранение', en: 'Saving' },
    manualNavigation: {
      ru: 'Категории настройки рамки',
      en: 'Frame style setting categories',
    },
    paddingLinked: { ru: 'Вместе', en: 'Linked' },
    paddingSeparate: { ru: 'По сторонам', en: 'Per side' },
    editTitle: {
      ru: 'Редактировать шаблон',
      en: 'Edit template',
    },
    newTitle: {
      ru: 'Новый шаблон рамки',
      en: 'New border template',
    },
    nameLabel: {
      ru: 'Название шаблона',
      en: 'Template name',
    },
    namePlaceholder: {
      ru: 'Например: Моя рамка',
      en: 'Example: My border',
    },
    previewLabel: {
      ru: 'Превью',
      en: 'Preview',
    },
    previewSampleText: {
      ru: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae lectus vel erat consequat posuere.',
      en: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae lectus vel erat consequat posuere.',
    },
    borderColorLabel: {
      ru: 'Цвет рамки',
      en: 'Border color',
    },
    fillColorLabel: {
      ru: 'Цвет заливки',
      en: 'Fill color',
    },
    widthLabel: {
      ru: 'Толщина',
      en: 'Width',
    },
    styleLabel: {
      ru: 'Стиль',
      en: 'Style',
    },
    styleSolid: {
      ru: 'Сплошная',
      en: 'Solid',
    },
    styleDashed: {
      ru: 'Пунктир',
      en: 'Dashed',
    },
    styleDotted: {
      ru: 'Точки',
      en: 'Dotted',
    },
    radiusLabel: {
      ru: 'Скругление',
      en: 'Radius',
    },
    strokeOpacityLabel: {
      ru: 'Прозрачность линии',
      en: 'Line opacity',
    },
    fillOpacityLabel: {
      ru: 'Прозрачность заливки',
      en: 'Fill opacity',
    },
    shadowLabel: {
      ru: 'Тень',
      en: 'Shadow',
    },
    shadowNone: {
      ru: 'Без тени',
      en: 'No shadow',
    },
    shadowSoft: {
      ru: 'Мягкая',
      en: 'Soft',
    },
    shadowHard: {
      ru: 'Яркая',
      en: 'Strong',
    },
    paddingLabel: {
      ru: 'Отступы от элемента',
      en: 'Element padding',
    },
    paddingTop: {
      ru: 'Сверху',
      en: 'Top',
    },
    paddingRight: {
      ru: 'Справа',
      en: 'Right',
    },
    paddingBottom: {
      ru: 'Снизу',
      en: 'Bottom',
    },
    paddingLeft: {
      ru: 'Слева',
      en: 'Left',
    },
    customCssLabel: {
      ru: 'Дополнительный CSS',
      en: 'Additional CSS',
    },
    customCssHint: {
      ru: '(безопасные свойства: background, font, text-*)',
      en: '(safe properties: background, font, text-*)',
    },
    customCssPlaceholder: {
      ru: 'background: rgba(249,115,22,0.1); font-weight: bold;',
      en: 'background: rgba(249,115,22,0.1); font-weight: bold;',
    },
    createButton: {
      ru: 'Создать шаблон',
      en: 'Create template',
    },
    blockedPropertiesPrefix: {
      ru: 'Заблокированные свойства:',
      en: 'Blocked properties:',
    },
  },
});
