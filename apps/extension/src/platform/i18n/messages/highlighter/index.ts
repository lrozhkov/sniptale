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
    opacityLabel: {
      ru: 'Совместимость',
      en: 'Compatibility',
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
      ru: 'Отступы от элемента (padding)',
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
    inheritCustomCssLabel: {
      ru: 'Наследовать',
      en: 'Inherit',
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
