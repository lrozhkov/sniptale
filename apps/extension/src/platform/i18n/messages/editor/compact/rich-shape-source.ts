import { defineMessageSource } from '../../source';

export const editorCompactRichShapeSourceMessages = defineMessageSource({
  richShapeSource: {
    ru: 'Источник',
    en: 'Source',
  },
  richShapeSourceName: {
    ru: 'Название',
    en: 'Name',
  },
  richShapeSourceItem: {
    ru: 'Элемент',
    en: 'Item',
  },
  richShapeSourceLibrary: {
    ru: 'Библиотека',
    en: 'Library',
  },
  richShapeSourceBuiltIn: {
    ru: 'Встроенная',
    en: 'Built-in',
  },
  richShapeSourceCustom: {
    ru: 'Своя',
    en: 'Custom',
  },
  richShapeSourceManualImport: {
    ru: 'Импорт',
    en: 'Import',
  },
  richShapeSourceExport: {
    ru: 'Экспорт',
    en: 'Export',
  },
  richShapeSourceLibraryType: {
    ru: 'Библиотека',
    en: 'Library',
  },
  richShapeSourceUnknown: {
    ru: 'Неизвестно',
    en: 'Unknown',
  },
  richShapeUnsupported: {
    ru: 'Недоступно',
    en: 'Unsupported',
  },
  richShapeMultipleSelection: {
    ru: 'Несколько фигур',
    en: 'Multiple shapes',
  },
  richShapeMultipleSelectionHint: {
    ru: 'Выберите одну фигуру, чтобы открыть детальные настройки.',
    en: 'Select one shape to edit detailed settings.',
  },
  richShapeRoughDisabled: {
    ru: 'Включите карандашный рендер, чтобы настроить неровность, изгиб и штриховку.',
    en: 'Enable sketch rendering to edit roughness, bowing, and hachure controls.',
  },
  richShapeRoughUnsupported: {
    ru: 'Для этой фигуры нет поддерживаемой геометрии карандашного рендера.',
    en: 'This shape has no supported sketch-rendering geometry.',
  },
});
