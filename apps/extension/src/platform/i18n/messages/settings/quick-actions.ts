import { defineMessageSource } from '../source';

export const settingsQuickActionsMessages = defineMessageSource({
  deleteActionTitle: {
    ru: 'Удалить действие?',
    en: 'Delete action?',
  },
  deleteActionMessagePrefix: {
    ru: 'Вы уверены, что хотите удалить действие',
    en: 'Are you sure you want to delete the action',
  },
  deleteActionMessageSuffix: {
    ru: '?',
    en: '?',
  },
  title: {
    ru: 'Быстрые действия',
    en: 'Quick actions',
  },
  subtitle: {
    ru: 'Создавайте пресеты для мгновенного захвата скриншотов',
    en: 'Create presets for instant screenshot capture',
  },
  basicsSection: {
    ru: 'Основное',
    en: 'Basics',
  },
  advancedSection: {
    ru: 'Дополнительно',
    en: 'Advanced',
  },
  advancedDescription: {
    ru: 'Задержка, эмуляция, формат и дополнительные действия',
    en: 'Delay, emulation, format, and extra actions',
  },
  showAdvanced: {
    ru: 'Показать дополнительные настройки',
    en: 'Show advanced settings',
  },
  hideAdvanced: {
    ru: 'Скрыть дополнительные настройки',
    en: 'Hide advanced settings',
  },
  editTitle: {
    ru: 'Редактирование',
    en: 'Edit action',
  },
  newTitle: {
    ru: 'Новое действие',
    en: 'New action',
  },
  nameLabel: {
    ru: 'Название *',
    en: 'Name *',
  },
  namePlaceholder: {
    ru: 'Например: Полный скриншот',
    en: 'Example: Full screenshot',
  },
  iconLabel: {
    ru: 'Иконка',
    en: 'Icon',
  },
  hotkeyLabel: {
    ru: 'Горячая клавиша',
    en: 'Hotkey',
  },
  hotkeyPlaceholder: {
    ru: 'Нажмите для записи...',
    en: 'Press to record...',
  },
  screenshotModeLabel: {
    ru: 'Режим скриншота',
    en: 'Screenshot mode',
  },
  screenEmulationLabel: {
    ru: 'Эмуляция экрана',
    en: 'Screen emulation',
  },
  delayLabel: {
    ru: 'Задержка скриншота',
    en: 'Capture delay',
  },
  imageFormatLabel: {
    ru: 'Формат изображения',
    en: 'Image format',
  },
  followSettingsPlaceholder: {
    ru: 'Как в настройках',
    en: 'Use settings default',
  },
  qualityLabel: {
    ru: 'Качество',
    en: 'Quality',
  },
  afterCaptureLabel: {
    ru: 'После захвата',
    en: 'After capture',
  },
  enabledLabel: {
    ru: 'Включено',
    en: 'Enabled',
  },
  exitAfterCaptureLabel: {
    ru: 'Выйти после захвата',
    en: 'Exit after capture',
  },
  displayModeTitle: {
    ru: 'Отображение в меню',
    en: 'Menu display',
  },
  displayModeList: {
    ru: 'Списком',
    en: 'List',
  },
  displayModeListDescription: {
    ru: 'Показывать быстрые действия вертикальным списком',
    en: 'Show quick actions as a vertical list',
  },
  displayModeHidden: {
    ru: 'Не показывать',
    en: 'Hidden',
  },
  displayModeHiddenDescription: {
    ru: 'Скрыть в главном меню',
    en: 'Hide from the main menu',
  },
  savedActionsLabel: {
    ru: 'Сохранённые действия',
    en: 'Saved actions',
  },
  emptyTitle: {
    ru: 'Нет быстрых действий',
    en: 'No quick actions',
  },
  emptyDescriptionPrefix: {
    ru: 'Нажмите',
    en: 'Click',
  },
  emptyDescriptionSuffix: {
    ru: 'для создания',
    en: 'to create one',
  },
  addButton: {
    ru: 'Добавить действие',
    en: 'Add action',
  },
  screenshotModeVisible: {
    ru: 'Видимая область',
    en: 'Visible area',
  },
  screenshotModeFull: {
    ru: 'Полная страница',
    en: 'Full page',
  },
  screenshotModeSelection: {
    ru: 'Выделенная область',
    en: 'Selected area',
  },
  afterCaptureDownloadDefault: {
    ru: 'Скачать в папку по умолчанию',
    en: 'Download to the default folder',
  },
  afterCaptureAskPreset: {
    ru: 'Выбор пресета',
    en: 'Choose preset',
  },
  afterCaptureAskSystem: {
    ru: 'Сохранить как... (системный диалог)',
    en: 'Save as... (system dialog)',
  },
  afterCaptureEdit: {
    ru: 'Открыть в редакторе',
    en: 'Open in editor',
  },
  afterCaptureCopy: {
    ru: 'Копировать в буфер',
    en: 'Copy to clipboard',
  },
  afterCaptureScenario: {
    ru: 'Записать в сценарий',
    en: 'Record to scenario',
  },
  delayNone: {
    ru: 'Без задержки',
    en: 'No delay',
  },
  delayShortSuffix: {
    ru: 'сек',
    en: 'sec',
  },
  emulationNone: {
    ru: 'Без эмуляции',
    en: 'No emulation',
  },
  statusOff: {
    ru: 'Выключить',
    en: 'Disable',
  },
  statusOn: {
    ru: 'Включить',
    en: 'Enable',
  },
  countOne: {
    ru: 'действие',
    en: 'action',
  },
  countFew: {
    ru: 'действия',
    en: 'actions',
  },
  countMany: {
    ru: 'действий',
    en: 'actions',
  },
  validationNameRequired: {
    ru: 'Название обязательно',
    en: 'Name is required',
  },
  messageUpdated: {
    ru: 'Действие обновлено',
    en: 'Action updated',
  },
  messageCreated: {
    ru: 'Действие создано',
    en: 'Action created',
  },
  messageDeleted: {
    ru: 'Действие удалено',
    en: 'Action deleted',
  },
  messageSettingSaved: {
    ru: 'Настройка сохранена',
    en: 'Setting saved',
  },
  bundledBadge: {
    ru: 'Предустановлено',
    en: 'Built in',
  },
  messageSaveErrorSuffix: {
    ru: ' сохранения',
    en: ' saving',
  },
});
