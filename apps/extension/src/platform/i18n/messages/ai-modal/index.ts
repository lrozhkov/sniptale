import { defineMessageSource } from '../source';

export const aiModalMessages = defineMessageSource({
  modelNotSelected: {
    ru: 'Модель не выбрана',
    en: 'Model not selected',
  },
  modelUnsetOption: {
    ru: '— Не выбрана —',
    en: '— Not selected —',
  },
  modelSearchPlaceholder: {
    ru: 'Поиск модели...',
    en: 'Search model...',
  },
  modelsNotFound: {
    ru: 'Модели не найдены',
    en: 'No models found',
  },
  modelsNotConfigured: {
    ru: 'Сначала настройте хотя бы одну AI-модель',
    en: 'Configure at least one AI model first',
  },
  modelRequired: {
    ru: 'Выберите модель для отправки запроса',
    en: 'Select a model to submit the request',
  },
  title: {
    ru: 'AI-редактирование контента',
    en: 'AI content editing',
  },
  closeTitle: {
    ru: 'Закрыть (Escape)',
    en: 'Close (Escape)',
  },
  promptLabel: {
    ru: 'Промпт для AI',
    en: 'Prompt for AI',
  },
  promptPlaceholder: {
    ru: 'Опишите, что нужно сделать с выбранными данными...',
    en: 'Describe what should be done with the selected data...',
  },
  voiceInputStart: {
    ru: 'Начать голосовой ввод',
    en: 'Start voice input',
  },
  voiceInputStop: {
    ru: 'Остановить голосовой ввод',
    en: 'Stop voice input',
  },
  voiceInputError: {
    ru: 'Не удалось запустить голосовой ввод',
    en: 'Voice input could not be started',
  },
  submitShortcutTitle: {
    ru: 'Отправить запрос',
    en: 'Submit request',
  },
  submitShortcutDescription: {
    ru: 'Отправить запрос. Сочетание клавиш: Ctrl + Enter.',
    en: 'Submit request. Keyboard shortcut: Ctrl + Enter.',
  },
  tokensSuffix: {
    ru: 'токенов',
    en: 'tokens',
  },
  cancelButton: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  processingButton: {
    ru: 'Обработка...',
    en: 'Processing...',
  },
  waitingCancelButton: {
    ru: 'Отменить ожидание',
    en: 'Cancel waiting',
  },
  waitingDescription: {
    ru: 'Можно отменить ожидание и вернуться к редактированию запроса.',
    en: 'You can cancel waiting and return to editing the request.',
  },
  waitingTitle: {
    ru: 'Ожидаем ответ от AI',
    en: 'Waiting for AI response',
  },
  submitButton: {
    ru: 'Отправить',
    en: 'Submit',
  },
  disclosureTitle: {
    ru: 'Перед отправкой',
    en: 'Before sending',
  },
  disclosureProviderLabel: {
    ru: 'Провайдер',
    en: 'Provider',
  },
  disclosureModelLabel: {
    ru: 'Модель',
    en: 'Model',
  },
  disclosureDataClassesLabel: {
    ru: 'Данные',
    en: 'Data',
  },
  disclosureDataClassesFields: {
    ru: 'editable fields',
    en: 'editable fields',
  },
  disclosureDataClassesTableRows: {
    ru: 'table rows',
    en: 'table rows',
  },
  disclosureDataClassesFieldsAndTableRows: {
    ru: 'editable fields and table rows',
    en: 'editable fields and table rows',
  },
  disclosureDataClassesSelectedPageData: {
    ru: 'selected page data',
    en: 'selected page data',
  },
  disclosureProviderChrome: {
    ru: 'Chrome AI на устройстве',
    en: 'Chrome AI on-device',
  },
  disclosureProviderLocalCustom: {
    ru: 'локальный или частный endpoint',
    en: 'local or private endpoint',
  },
  disclosureProviderExternal: {
    ru: 'внешний provider endpoint',
    en: 'external provider endpoint',
  },
  disclosurePayloadCopy: {
    ru: 'Будут отправлены выбранные данные страницы и ваш промпт.',
    en: 'Selected page data and your prompt will be sent.',
  },
  disclosureExternalCopy: {
    ru: 'Для внешнего провайдера данные покидают браузер через настроенный provider URL.',
    en: 'For an external provider, data leaves the browser through the configured provider URL.',
  },
  disclosureLocalCopy: {
    ru: 'Для Chrome AI или локального endpoint данные не отправляются на внешний provider URL.',
    en: 'For Chrome AI or a local endpoint, data is not sent to an external provider URL.',
  },
  disclosureHistoryCopy: {
    ru: 'История AI хранит только метаданные запроса, без промпта и данных страницы.',
    en: 'AI history stores request metadata only, not the prompt or page data.',
  },
  templatesLabel: {
    ru: 'Шаблоны',
    en: 'Templates',
  },
  templatesDescription: {
    ru: 'Выберите готовый запрос или создайте свой.',
    en: 'Choose a ready-made request or create your own.',
  },
  templatesLoadingSuffix: {
    ru: ' шаблонов...',
    en: ' templates...',
  },
  templatesEmpty: {
    ru: 'Нет шаблонов. Нажмите «+» для создания.',
    en: 'No templates. Press “+” to create one.',
  },
  templateActionsTitle: {
    ru: 'Действия',
    en: 'Actions',
  },
  templatesShowAllTitle: {
    ru: 'Показать все шаблоны',
    en: 'Show all templates',
  },
  templatesShowMoreSuffix: {
    ru: ' ещё',
    en: ' more',
  },
  addTemplateTitleSuffix: {
    ru: ' новый шаблон',
    en: ' new template',
  },
  deleteDefaultTemplateTitle: {
    ru: 'Удалить стандартный шаблон?',
    en: 'Delete default template?',
  },
  disableSystemTemplate: {
    ru: 'Скрыть шаблон',
    en: 'Hide template',
  },
  enableSystemTemplate: {
    ru: 'Вернуть шаблон',
    en: 'Restore template',
  },
  disableSystemTemplateTitle: {
    ru: 'Скрыть системный шаблон?',
    en: 'Hide system template?',
  },
  enableSystemTemplateTitle: {
    ru: 'Вернуть системный шаблон?',
    en: 'Restore system template?',
  },
  disableSystemTemplateMessage: {
    ru: 'Шаблон «{name}» останется в каталоге, но не будет доступен для выбора.',
    en: '“{name}” will remain in the catalog but will not be available for selection.',
  },
  enableSystemTemplateMessage: {
    ru: 'Шаблон «{name}» снова станет доступен для выбора.',
    en: '“{name}” will become available for selection again.',
  },
  deleteTemplateTitle: {
    ru: 'Удалить шаблон?',
    en: 'Delete template?',
  },
  deleteTemplateMessagePrefix: {
    ru: 'Вы уверены, что хотите удалить шаблон "',
    en: 'Are you sure you want to delete the template "',
  },
  deleteTemplateMessageSuffix: {
    ru: '"?',
    en: '"?',
  },
  dataSummaryNone: {
    ru: 'Ничего не выбрано',
    en: 'Nothing selected',
  },
  dataSummaryAllPrefix: {
    ru: 'Выбраны все элементы (',
    en: 'All items selected (',
  },
  dataSummaryAllSuffix: {
    ru: ')',
    en: ')',
  },
  dataSummarySomePrefix: {
    ru: 'Выбрано ',
    en: 'Selected ',
  },
  dataSummarySomeMiddle: {
    ru: ' из ',
    en: ' of ',
  },
  dataSummarySomeSuffix: {
    ru: ' элементов',
    en: ' items',
  },
  collapseRowsTitle: {
    ru: 'Свернуть строки',
    en: 'Collapse rows',
  },
  expandRowsTitle: {
    ru: 'Развернуть строки',
    en: 'Expand rows',
  },
  excludeColumnsLabel: {
    ru: 'Исключить:',
    en: 'Exclude:',
  },
  collapseTitle: {
    ru: 'Свернуть',
    en: 'Collapse',
  },
  expandTitle: {
    ru: 'Развернуть',
    en: 'Expand',
  },
  dataForProcessingLabel: {
    ru: 'Данные для обработки:',
    en: 'Data for processing:',
  },
  collapseAllGroupsTitle: {
    ru: 'Свернуть все группы',
    en: 'Collapse all groups',
  },
  expandAllGroupsTitle: {
    ru: 'Развернуть все группы',
    en: 'Expand all groups',
  },
  collapseAllButton: {
    ru: 'Свернуть всё',
    en: 'Collapse all',
  },
  expandAllButton: {
    ru: 'Развернуть всё',
    en: 'Expand all',
  },
  clearSelectionTitle: {
    ru: 'Снять выделение со всех элементов',
    en: 'Clear selection from all items',
  },
  selectAllTitle: {
    ru: 'Выделить все элементы',
    en: 'Select all items',
  },
  clearSelectionButton: {
    ru: 'Снять всё',
    en: 'Clear all',
  },
  selectAllButton: {
    ru: 'Выделить всё',
    en: 'Select all',
  },
  hideJsonTitle: {
    ru: 'Скрыть данные, которые будут отправлены',
    en: 'Hide the data that will be sent',
  },
  showJsonTitle: {
    ru: 'Показать данные, которые будут отправлены',
    en: 'Show the data that will be sent',
  },
  hideJsonButton: {
    ru: 'Скрыть отправляемые данные',
    en: 'Hide data to send',
  },
  showJsonButton: {
    ru: 'Показать отправляемые данные',
    en: 'Show data to send',
  },
  copied: {
    ru: 'Скопировано',
    en: 'Copied',
  },
  copyButton: {
    ru: 'Скопировать',
    en: 'Copy',
  },
});
