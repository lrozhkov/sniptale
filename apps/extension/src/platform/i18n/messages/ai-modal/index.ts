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
    ru: 'AI-редактор контента',
    en: 'AI content editor',
  },
  closeTitle: {
    ru: 'Закрыть (Escape)',
    en: 'Close (Escape)',
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
  disclosureCompactExternal: {
    ru: 'Отправить промпт и выбранные данные страницы в настроенную AI-модель.',
    en: 'Send the prompt and selected page data to the configured AI model.',
  },
  disclosureCompactLocal: {
    ru: 'Обработать промпт и выбранные данные страницы локально.',
    en: 'Process the prompt and selected page data locally.',
  },
  templatesLabel: {
    ru: 'Шаблоны',
    en: 'Templates',
  },
  chooseTemplate: {
    ru: 'Выбрать шаблон',
    en: 'Choose template',
  },
  templatesLoadingCompact: {
    ru: 'Загрузка шаблонов...',
    en: 'Loading templates...',
  },
  openPromptTemplatesSettings: {
    ru: 'Открыть настройки промптов и шаблонов',
    en: 'Open prompt and template settings',
  },
  openModelSettings: {
    ru: 'Открыть настройки подключений и моделей',
    en: 'Open connection and model settings',
  },
  openSettingsFailed: {
    ru: 'Не удалось открыть настройки AI',
    en: 'AI settings could not be opened',
  },
  disclosureLocalDestination: {
    ru: 'локальная модель Chrome',
    en: 'local Chrome model',
  },
  disclosureExternalDestination: {
    ru: 'настроенный AI-провайдер',
    en: 'configured AI provider',
  },
  disclosureSelectedData: {
    ru: 'промпт и выбранные данные страницы',
    en: 'the prompt and selected page data',
  },
  disclosureNoPageData: {
    ru: 'промпт без данных страницы',
    en: 'the prompt without page data',
  },
  disclosureSummary: {
    ru: 'Отправка: {data} → {destination}, модель {model}.',
    en: 'Sending: {data} → {destination}, model {model}.',
  },
  disclosureHistory: {
    ru: 'В истории сохраняются только метаданные запроса.',
    en: 'Only request metadata is retained in history.',
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
    ru: 'Данные для обработки',
    en: 'Data for processing',
  },
  searchDataLabel: {
    ru: 'Поиск в данных для обработки',
    en: 'Search data for processing',
  },
  searchDataPlaceholder: {
    ru: 'Найти данные...',
    en: 'Find data...',
  },
  clearSearchLabel: {
    ru: 'Очистить поиск',
    en: 'Clear search',
  },
  showSelectedOnlyLabel: {
    ru: 'Скрыть невыбранные элементы',
    en: 'Hide unselected items',
  },
  showAllDataLabel: {
    ru: 'Показать все элементы',
    en: 'Show all items',
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
