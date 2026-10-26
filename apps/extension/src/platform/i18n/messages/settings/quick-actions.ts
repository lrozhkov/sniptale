import { defineMessageSource } from '../source';

export const settingsQuickActionsMessages = defineMessageSource({
  placementPopup: { ru: 'В окне расширения', en: 'In the extension popup' },
  placementCorner: { ru: 'В угловой группе страницы', en: 'In the page corner group' },
  placementToolbar: { ru: 'На панели страницы', en: 'In the page toolbar' },
  appearanceAction: { ru: 'Действие', en: 'Action' },
  appearanceCapture: { ru: 'Захват', en: 'Capture' },
  appearanceHeader: { ru: 'Шапка окна', en: 'Window header' },
  appearanceBackground: { ru: 'Фон', en: 'Background' },
  appearanceInformation: { ru: 'Информация', en: 'Information' },
  appearanceNavigation: { ru: 'Разделы действия', en: 'Action sections' },
  appearanceSourcesHint: {
    ru: 'Данные страницы берутся при захвате. Недоступные значения пропускаются.',
    en: 'Page values are read at capture time. Unavailable values are omitted.',
  },
  appearancePageSource: { ru: 'Со страницы', en: 'From page' },
  appearanceStaticSource: { ru: 'Свой текст', en: 'Custom text' },
  appearanceTitleSource: { ru: 'Источник заголовка', en: 'Title source' },
  appearanceAddressSource: { ru: 'Источник адреса', en: 'Address source' },
  appearanceIconEnabled: { ru: 'Иконка сайта', en: 'Website icon' },
  appearanceIconSource: { ru: 'Источник иконки', en: 'Icon source' },
  appearanceIconPage: { ru: 'Страница захвата', en: 'Captured page' },
  appearanceIconUpload: { ru: 'Загруженный файл', en: 'Uploaded file' },
  appearanceIconWebsite: { ru: 'Другой сайт', en: 'Another website' },
  appearanceIconWebsiteAddress: { ru: 'Адрес сайта для иконки', en: 'Website address for icon' },
  appearanceUploadIcon: { ru: 'Загрузить иконку', en: 'Upload icon' },
  appearanceBackgroundKind: { ru: 'Тип фона', en: 'Background type' },
  appearanceNone: { ru: 'Без фона', en: 'None' },
  appearancePaint: { ru: 'Цвет или градиент', en: 'Color or gradient' },
  appearanceImage: { ru: 'Изображение', en: 'Image' },
  appearancePaintLabel: { ru: 'Заливка фона', en: 'Background fill' },
  appearanceGradientPresets: { ru: 'Градиенты', en: 'Gradients' },
  appearancePadding: { ru: 'Отступ', en: 'Padding' },
  appearanceRadius: { ru: 'Скругление снимка', en: 'Screenshot radius' },
  appearanceShadow: { ru: 'Тень снимка', en: 'Screenshot shadow' },
  appearanceFit: { ru: 'Размещение изображения', en: 'Image fit' },
  appearanceCover: { ru: 'Заполнить', en: 'Cover' },
  appearanceContain: { ru: 'Вписать', en: 'Contain' },
  appearanceImageLimit: { ru: 'Изображение до 2 МиБ.', en: 'Image up to 2 MiB.' },
  appearanceImageFailed: {
    ru: 'Не удалось добавить изображение. Допустимый размер — до 2 МиБ.',
    en: 'Could not add the image. The size limit is 2 MiB.',
  },
  appearanceInformationEnabled: { ru: 'Добавить подпись', en: 'Add caption' },
  appearancePosition: { ru: 'Положение подписи', en: 'Caption position' },
  appearanceAbove: { ru: 'Над снимком', en: 'Above screenshot' },
  appearanceBelow: { ru: 'Под снимком', en: 'Below screenshot' },
  appearancePageTitle: { ru: 'Заголовок страницы', en: 'Page title' },
  appearancePageAddress: { ru: 'Адрес страницы', en: 'Page address' },
  appearanceDate: { ru: 'Дата и время захвата', en: 'Capture date and time' },
  appearanceDimensions: { ru: 'Размер снимка', en: 'Screenshot dimensions' },
  appearanceCaptionText: { ru: 'Свой текст подписи', en: 'Custom caption text' },
  appearanceCaptionColor: { ru: 'Цвет текста', en: 'Text color' },
  appearanceCaptionSize: { ru: 'Размер текста', en: 'Text size' },
  appearanceInvalid: {
    ru: 'Проверьте настройки оформления.',
    en: 'Check the appearance settings.',
  },

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
    ru: 'Создавайте шаблоны для мгновенного захвата скриншотов',
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
    ru: 'Задержка, размер окна, формат и дополнительные действия',
    en: 'Delay, window size, format, and extra actions',
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
  moreIcons: { ru: 'Все иконки', en: 'All icons' },
  fewerIcons: { ru: 'Меньше иконок', en: 'Fewer icons' },
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
    ru: 'Шаблон размера окна',
    en: 'Window size preset',
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
    ru: 'Закрыть инструменты после захвата',
    en: 'Close tools after capture',
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
  resetAction: {
    ru: 'Восстановить заводские настройки',
    en: 'Restore factory settings',
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
  screenshotModeDesktop: {
    ru: 'Окно или экран',
    en: 'Window or screen',
  },
  afterCaptureDownloadDefault: {
    ru: 'Скачать в папку по умолчанию',
    en: 'Download to the default folder',
  },
  afterCaptureAskPreset: {
    ru: 'Выбор шаблона',
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
  afterCaptureSaveToLibrary: {
    ru: 'Сохранить в библиотеку',
    en: 'Save to library',
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
    ru: 'Текущий размер',
    en: 'Current size',
  },
  statusOff: {
    ru: 'Выключить',
    en: 'Disable',
  },
  statusOn: {
    ru: 'Включить',
    en: 'Enable',
  },
  validationNameRequired: {
    ru: 'Название обязательно',
    en: 'Name is required',
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
