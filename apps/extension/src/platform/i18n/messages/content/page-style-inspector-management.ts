import { defineMessageSource } from '../source';

export const contentPageStyleInspectorManagementMessages = defineMessageSource({
  templateName: {
    ru: 'Название шаблона',
    en: 'Template name',
  },
  defaultTemplateName: {
    ru: 'Шаблон',
    en: 'Template',
  },
  ruleName: {
    ru: 'Название правила',
    en: 'Rule name',
  },
  defaultRuleName: {
    ru: 'Правило',
    en: 'Rule',
  },
  saveTemplate: {
    ru: 'Сохранить шаблон',
    en: 'Save template',
  },
  saveTemplatePending: {
    ru: 'Сохранение шаблона...',
    en: 'Saving template...',
  },
  saveTemplateSuccess: {
    ru: 'Шаблон сохранен',
    en: 'Template saved',
  },
  saveTemplateFailed: {
    ru: 'Не удалось сохранить шаблон',
    en: 'Could not save the template',
  },
  saveAsTemplate: {
    ru: 'Сохранить как шаблон',
    en: 'Save as template',
  },
  saveAsRule: {
    ru: 'Сохранить как правило',
    en: 'Save as rule',
  },
  templateChangedOnlyHint: {
    ru: 'только измененные',
    en: 'changed only',
  },
  ruleExactAddressHint: {
    ru: 'точный адрес',
    en: 'exact address',
  },
  contentRetentionTitle: {
    ru: 'Восстановление содержимого',
    en: 'Content restore',
  },
  includeComputedInTemplate: {
    ru: 'Включить все вычисленные свойства',
    en: 'Include all computed properties',
  },
  saveRule: {
    ru: 'Сохранить правило',
    en: 'Save rule',
  },
  applyTemplate: {
    ru: 'Применить',
    en: 'Apply',
  },
  applyRule: {
    ru: 'Применить',
    en: 'Apply',
  },
  exactAddressScope: {
    ru: 'Точный адрес',
    en: 'Exact address',
  },
  domainScope: {
    ru: 'Домен',
    en: 'Domain',
  },
  retainText: {
    ru: 'Сохранять текст',
    en: 'Retain text',
  },
  retainImage: {
    ru: 'Сохранять изображение',
    en: 'Retain image',
  },
  noTemplates: {
    ru: 'Шаблонов пока нет',
    en: 'No templates yet',
  },
  noRules: {
    ru: 'Для этой страницы правил нет',
    en: 'No rules for this page',
  },
  searchTemplates: {
    ru: 'Найти шаблон',
    en: 'Search templates',
  },
  searchRules: {
    ru: 'Найти правило',
    en: 'Search rules',
  },
  duplicateTemplate: {
    ru: 'Дублировать шаблон',
    en: 'Duplicate template',
  },
  renameTemplate: {
    ru: 'Переименовать шаблон',
    en: 'Rename template',
  },
  updateTemplate: {
    ru: 'Обновить из блока',
    en: 'Update from block',
  },
  cancelTemplateRename: {
    ru: 'Отменить переименование',
    en: 'Cancel rename',
  },
  deleteTemplate: {
    ru: 'Удалить шаблон',
    en: 'Delete template',
  },
  noTemplatesMatched: {
    ru: 'Подходящих шаблонов нет',
    en: 'No matching templates',
  },
  registryLoading: {
    ru: 'Загрузка...',
    en: 'Loading...',
  },
  registryLoadError: {
    ru: 'Не удалось загрузить шаблоны и правила',
    en: 'Could not load templates and rules',
  },
  templateImageOnlyHint: {
    ru: 'Нужен выбранный блок изображения',
    en: 'Select an image block first',
  },
  templateUnsupportedCssHint: {
    ru: 'Есть CSS-значения, которые будут применены как есть',
    en: 'Contains CSS values that will be applied as-is',
  },
  templateDeclarations: {
    ru: 'свойств',
    en: 'properties',
  },
  templateAssets: {
    ru: 'файлов',
    en: 'assets',
  },
  templateBackgroundAsset: {
    ru: 'Файл фона',
    en: 'Background file',
  },
  templateImageAsset: {
    ru: 'Файл изображения',
    en: 'Image file',
  },
  templateResetValue: {
    ru: 'сброс',
    en: 'reset',
  },
  templateApplied: {
    ru: 'Шаблон применен',
    en: 'Template applied',
  },
  templateUpdated: {
    ru: 'Шаблон обновлен',
    en: 'Template updated',
  },
  templateRenamed: {
    ru: 'Шаблон переименован',
    en: 'Template renamed',
  },
  templateDuplicated: {
    ru: 'Шаблон продублирован',
    en: 'Template duplicated',
  },
  templateDeleted: {
    ru: 'Шаблон удален',
    en: 'Template deleted',
  },
  templateCleanupWarning: {
    ru: 'Действие выполнено, но часть файлов не удалось очистить',
    en: 'Action completed, but some files could not be cleaned up',
  },
  fileActionPending: {
    ru: 'Сохранение...',
    en: 'Saving...',
  },
  fileActionError: {
    ru: 'Не удалось сохранить файл',
    en: 'Could not save the file',
  },
  fileCleanupError: {
    ru: 'Не удалось применить файл и очистить временную копию',
    en: 'Could not apply the file and clean up the temporary copy',
  },
  templateActionPending: {
    ru: 'Обновление шаблона...',
    en: 'Updating template...',
  },
  templateActionFailed: {
    ru: 'Не удалось выполнить действие с шаблоном',
    en: 'Could not update the template',
  },
  enableRule: {
    ru: 'Включить правило',
    en: 'Enable rule',
  },
  disableRule: {
    ru: 'Выключить правило',
    en: 'Disable rule',
  },
  deleteRule: {
    ru: 'Удалить правило',
    en: 'Delete rule',
  },
  ruleActionPending: {
    ru: 'Обновление правила...',
    en: 'Updating rule...',
  },
  ruleActionFailed: {
    ru: 'Не удалось выполнить действие с правилом',
    en: 'Could not update the rule',
  },
  ruleDeleted: {
    ru: 'Правило удалено',
    en: 'Rule deleted',
  },
  ruleEnabled: {
    ru: 'применяется',
    en: 'applies',
  },
  ruleDisabled: {
    ru: 'выключено',
    en: 'disabled',
  },
});
