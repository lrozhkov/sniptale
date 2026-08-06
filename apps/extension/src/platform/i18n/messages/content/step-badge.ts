import { defineMessageSource } from '../source';

export const contentStepBadgeMessages = defineMessageSource({
  settingsTitle: {
    ru: 'Нумерация',
    en: 'Numbering',
  },
  closeSettings: {
    ru: 'Закрыть настройки нумерации',
    en: 'Close numbering settings',
  },
  modePreset: { ru: 'Шаблоны', en: 'Templates' },
  modeManual: { ru: 'Вручную', en: 'Manual' },
  switchToManual: { ru: 'Настроить', en: 'Customize' },
  switchToPresets: { ru: 'Шаблоны', en: 'Templates' },
  presetsSection: { ru: 'Шаблоны', en: 'Templates' },
  configurePreset: { ru: 'Настроить шаблон', en: 'Configure template' },
  showPreset: { ru: 'Показать шаблон', en: 'Show template' },
  hidePreset: { ru: 'Скрыть шаблон', en: 'Hide template' },
  presetLoadError: { ru: 'Не удалось загрузить шаблоны', en: 'Could not load templates' },
  numberingSection: { ru: 'Нумерация', en: 'Numbering' },
  appearanceSection: { ru: 'Размер и цвета', en: 'Size and colors' },
  colorsSection: { ru: 'Цвета', en: 'Colors' },
  cssSection: { ru: 'Стили', en: 'Styles' },
  cssLabel: { ru: 'Дополнительные CSS-свойства', en: 'Additional CSS properties' },
  cssHint: {
    ru: 'Секции: [badge] — плашка, [text] — текст. Применяются только безопасные декоративные свойства.',
    en: 'Sections: [badge] for the badge and [text] for its text. Only safe decorative properties are applied.',
  },
  cssPlaceholder: {
    ru: '[badge]\nborder-radius: 6px;\n\n[text]\nfont-style: italic;',
    en: '[badge]\nborder-radius: 6px;\n\n[text]\nfont-style: italic;',
  },
  cssBlockedProperties: {
    ru: 'Недоступные свойства:',
    en: 'Unsupported properties:',
  },
  cssUnsafeError: {
    ru: 'CSS содержит небезопасную конструкцию',
    en: 'CSS contains an unsafe construct',
  },
  cssSyntaxError: { ru: 'Проверьте синтаксис CSS', en: 'Check the CSS syntax' },
  saveSection: { ru: 'Сохранение', en: 'Saving' },
  manualNavigation: { ru: 'Параметры нумерации', en: 'Numbering options' },
  sizeSource: { ru: 'Источник размера', en: 'Size source' },
  sizeFromFrame: { ru: 'От рамки', en: 'From frame' },
  sizeCustom: { ru: 'Свой', en: 'Custom' },
  diameter: { ru: 'Диаметр', en: 'Diameter' },
  background: { ru: 'Фон', en: 'Background' },
  textColor: { ru: 'Текст', en: 'Text' },
  outline: { ru: 'Обводка', en: 'Outline' },
  colorSourceLabel: { ru: 'Источник цвета', en: 'Color source' },
  colorSource: {
    custom: { ru: 'Свой цвет', en: 'Custom color' },
    frameBorder: { ru: 'Цвет рамки', en: 'Frame border' },
    frameFill: { ru: 'Заливка рамки', en: 'Frame fill' },
    surface: { ru: 'Поверхность', en: 'Surface' },
  },
  saveAsTemplate: { ru: 'Сохранить как новый шаблон', en: 'Save as new template' },
  updateTemplate: { ru: 'Обновить выбранный шаблон', en: 'Update selected template' },
  templateName: { ru: 'Название шаблона', en: 'Template name' },
  templateNameExists: {
    ru: 'Шаблон с таким названием уже существует',
    en: 'A template with this name already exists',
  },
  createTemplate: { ru: 'Создать', en: 'Create' },
  selectTemplate: { ru: 'Выберите шаблон', en: 'Select template' },
  overwriteTemplate: { ru: 'Обновить шаблон', en: 'Update template' },
  tooltipPrefix: {
    ru: 'Шаг',
    en: 'Step',
  },
  positionSection: {
    ru: 'Позиция и смещение',
    en: 'Position and offset',
  },
  offsetUp: {
    ru: 'Сместить вверх',
    en: 'Move up',
  },
  offsetLeft: {
    ru: 'Сместить влево',
    en: 'Move left',
  },
  offsetRight: {
    ru: 'Сместить вправо',
    en: 'Move right',
  },
  offsetDown: {
    ru: 'Сместить вниз',
    en: 'Move down',
  },
  sizeSection: {
    ru: 'Размер',
    en: 'Size',
  },
  autoTitle: {
    ru: 'Автоматическая нумерация',
    en: 'Automatic numbering',
  },
  autoHint: {
    ru: 'Порядок берётся из общей последовательности рамок',
    en: 'The order is taken from the shared frame sequence',
  },
  typeLabel: {
    ru: 'Тип',
    en: 'Type',
  },
  typeNumber: {
    ru: '123',
    en: '123',
  },
  typeLetter: {
    ru: 'АБВ',
    en: 'ABC',
  },
  alphabetLabel: {
    ru: 'Алфавит',
    en: 'Alphabet',
  },
  alphabetCyrillic: {
    ru: 'Кириллица',
    en: 'Cyrillic',
  },
  alphabetLatin: {
    ru: 'Latin',
    en: 'Latin',
  },
  valueSection: {
    ru: 'Значение',
    en: 'Value',
  },
  moveUp: {
    ru: 'Переместить выше',
    en: 'Move higher',
  },
  autoPlaceholder: {
    ru: 'Авто',
    en: 'Auto',
  },
  moveDown: {
    ru: 'Переместить ниже',
    en: 'Move lower',
  },
  disableButton: {
    ru: 'Выключить',
    en: 'Disable',
  },
});
