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
    title: { ru: 'Пресеты комментариев', en: 'Comment presets' },
    description: {
      ru: 'Настраивайте, скрывайте и расставляйте варианты коллаутов.',
      en: 'Customize, hide, and reorder reusable callout designs.',
    },
    add: { ru: 'Добавить пресет', en: 'Add preset' },
    defaultBadge: { ru: 'По умолчанию', en: 'Default' },
    systemBadge: { ru: 'Системный', en: 'System' },
    makeDefault: { ru: 'Сделать основным', en: 'Make default' },
    toggle: { ru: 'Показывать в списке', en: 'Show in list' },
    lastEnabled: {
      ru: 'Должен остаться один пресет',
      en: 'At least one preset must remain enabled',
    },
    reset: { ru: 'Восстановить системный вариант', en: 'Restore system preset' },
    connector: {
      none: { ru: 'Без коннектора', en: 'No connector' },
      wedge: { ru: 'Хвостик', en: 'Tail' },
      line: { ru: 'Линия', en: 'Line' },
    },
    editor: {
      newTitle: { ru: 'Новый пресет комментария', en: 'New comment preset' },
      editTitle: { ru: 'Изменить пресет комментария', en: 'Edit comment preset' },
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
        ru: 'Не удалось загрузить пресеты комментариев',
        en: 'Could not load comment presets',
      },
      saveError: {
        ru: 'Не удалось сохранить пресеты комментариев',
        en: 'Could not save comment presets',
      },
      created: { ru: 'Пресет создан', en: 'Preset created' },
      updated: { ru: 'Пресет обновлён', en: 'Preset updated' },
      deleted: { ru: 'Пресет удалён', en: 'Preset deleted' },
      reset: { ru: 'Системный пресет восстановлен', en: 'System preset restored' },
      defaultUpdated: { ru: 'Пресет по умолчанию изменён', en: 'Default preset updated' },
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
      ru: 'Пресет по умолчанию изменён',
      en: 'Default preset updated',
    },
    systemPresetDeleteError: {
      ru: 'Системный пресет нельзя удалить',
      en: 'System preset cannot be deleted',
    },
    lastPresetDeleteError: {
      ru: 'Нельзя удалить последний пресет',
      en: 'Cannot delete the last preset',
    },
    presetDeleted: {
      ru: 'Пресет удалён',
      en: 'Preset deleted',
    },
    presetUpdated: {
      ru: 'Пресет обновлён',
      en: 'Preset updated',
    },
    presetCreated: {
      ru: 'Пресет создан',
      en: 'Preset created',
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
      ru: 'Пресеты рамок',
      en: 'Border presets',
    },
    countOne: {
      ru: 'пресет',
      en: 'preset',
    },
    countFew: {
      ru: 'пресета',
      en: 'presets',
    },
    countMany: {
      ru: 'пресетов',
      en: 'presets',
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
      ru: 'Системный пресет нельзя редактировать',
      en: 'System preset cannot be edited',
    },
    systemPresetDeleteDisabled: {
      ru: 'Системный пресет нельзя удалить',
      en: 'System preset cannot be deleted',
    },
    lastEnabledPresetDisabled: {
      ru: 'Должен остаться хотя бы один включённый пресет',
      en: 'At least one preset must remain enabled',
    },
    resetSystemPresetTitle: {
      ru: 'Восстановить заводской вариант',
      en: 'Restore factory preset',
    },
    presetReset: {
      ru: 'Заводской вариант восстановлен',
      en: 'Factory preset restored',
    },
    addButton: {
      ru: 'Добавить пресет',
      en: 'Add preset',
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
  },
  editor: {
    outlineSection: { ru: 'Контур', en: 'Outline' },
    fillSection: { ru: 'Заливка', en: 'Fill' },
    geometrySection: { ru: 'Геометрия', en: 'Geometry' },
    effectsSection: { ru: 'Эффекты', en: 'Effects' },
    saveSection: { ru: 'Сохранение', en: 'Saving' },
    manualNavigation: {
      ru: 'Категории настройки рамки',
      en: 'Frame style setting categories',
    },
    paddingLinked: { ru: 'Вместе', en: 'Linked' },
    paddingSeparate: { ru: 'По сторонам', en: 'Per side' },
    editTitle: {
      ru: 'Редактировать пресет',
      en: 'Edit preset',
    },
    newTitle: {
      ru: 'Новый пресет рамки',
      en: 'New border preset',
    },
    nameLabel: {
      ru: 'Название пресета',
      en: 'Preset name',
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
      ru: 'Создать пресет',
      en: 'Create preset',
    },
    blockedPropertiesPrefix: {
      ru: 'Заблокированные свойства:',
      en: 'Blocked properties:',
    },
  },
});
