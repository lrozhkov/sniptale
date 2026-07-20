import { defineMessageSource } from '../../source';

export const contentToolbarCaptureMessages = defineMessageSource({
  captureDownloadLabel: {
    ru: 'Скачать',
    en: 'Download',
  },
  captureDownloadHint: {
    ru: 'Сохраняет файл сразу в папку по умолчанию',
    en: 'Saves the file immediately into the default folder',
  },
  captureAskPresetLabel: {
    ru: 'Выбор пресета',
    en: 'Choose preset',
  },
  captureAskPresetHint: {
    ru: 'Показывает список заранее настроенных путей в Downloads',
    en: 'Shows the list of prepared paths inside Downloads',
  },
  captureAskSystemLabel: {
    ru: 'Сохранить как...',
    en: 'Save as...',
  },
  captureAskSystemHint: {
    ru: 'Показывает системный диалог имени и пути',
    en: 'Shows the system dialog for file name and path',
  },
  captureCopyLabel: {
    ru: 'Копировать',
    en: 'Copy',
  },
  captureCopyHint: {
    ru: 'Кладет изображение в буфер обмена',
    en: 'Places the image into the clipboard',
  },
  captureScenarioLabel: {
    ru: 'Сценарий',
    en: 'Scenario',
  },
  captureScenarioHint: {
    ru: 'Записывает шаги сценария и связывает снимки с проектом',
    en: 'Records scenario steps and links captures to a project',
  },
  captureEditLabel: {
    ru: 'Редактор',
    en: 'Editor',
  },
  captureEditHint: {
    ru: 'Открывает встроенный редактор скриншота',
    en: 'Opens the built-in screenshot editor',
  },
  timerNoneLabel: {
    ru: 'Без задержки',
    en: 'No delay',
  },
  timerNoneHint: {
    ru: 'Снимок делается сразу после клика',
    en: 'The capture is taken immediately after the click',
  },
  timerThreeLabel: {
    ru: '3 секунды',
    en: '3 seconds',
  },
  timerThreeHint: {
    ru: 'Быстрая пауза для раскрытия простых меню',
    en: 'A quick pause for opening simple menus',
  },
  timerFiveLabel: {
    ru: '5 секунд',
    en: '5 seconds',
  },
  timerFiveHint: {
    ru: 'Универсальный вариант для подготовки интерфейса',
    en: 'A balanced option for preparing the interface',
  },
  timerTenLabel: {
    ru: '10 секунд',
    en: '10 seconds',
  },
  timerTenHint: {
    ru: 'Подходит для перехода в другое приложение',
    en: 'Useful when switching to another application',
  },
  afterCaptureCopy: {
    ru: 'После захвата: Копировать',
    en: 'After capture: Copy',
  },
  afterCaptureScenario: {
    ru: 'После захвата: Сценарий',
    en: 'After capture: Scenario',
  },
  afterCaptureEdit: {
    ru: 'После захвата: Редактор',
    en: 'After capture: Editor',
  },
  afterCaptureAskPreset: {
    ru: 'После захвата: Выбрать подготовленный путь',
    en: 'After capture: Choose a prepared path',
  },
  afterCaptureAskSystem: {
    ru: 'После захвата: Сохранить как...',
    en: 'After capture: Save as...',
  },
  afterCaptureDownload: {
    ru: 'После захвата: Скачать',
    en: 'After capture: Download',
  },
  visibleArea: {
    ru: 'Видимая область',
    en: 'Visible area',
  },
  fullPage: {
    ru: 'Полная страница',
    en: 'Full page',
  },
  selectionArea: {
    ru: 'Выделенная область',
    en: 'Selected area',
  },
  afterCaptureTitle: {
    ru: 'После захвата',
    en: 'After capture',
  },
  screenshotDelayTooltip: {
    ru: 'Задержка скриншота',
    en: 'Screenshot delay',
  },
  timerBadgeSuffix: {
    ru: 'с',
    en: 's',
  },
  delayTitle: {
    ru: 'Задержка',
    en: 'Delay',
  },
  viewportButton: {
    ru: 'Эмуляция экрана',
    en: 'Screen emulation',
  },
  viewportMenuTitle: {
    ru: 'Viewport страницы',
    en: 'Page viewport',
  },
  viewportNativeLabel: {
    ru: 'Нативный размер',
    en: 'Native size',
  },
  viewportNativeHint: {
    ru: 'Оставляет текущий viewport страницы без эмуляции',
    en: 'Keeps the current page viewport without emulation',
  },
  localHtmlSaveLabel: {
    ru: 'Сохранить подготовленную HTML-страницу',
    en: 'Save prepared HTML page',
  },
  localHtmlSavePickerDescription: {
    ru: 'HTML-документ',
    en: 'HTML document',
  },
  localHtmlSaveSaving: {
    ru: 'Сохранение подготовленной HTML-страницы...',
    en: 'Saving prepared HTML page...',
  },
  localHtmlSaveSaved: {
    ru: 'Подготовленная HTML-страница сохранена',
    en: 'Prepared HTML page saved',
  },
  localHtmlSaveSavedWithWarnings: {
    ru: 'Подготовленная HTML-страница сохранена с предупреждениями',
    en: 'Prepared HTML page saved with warnings',
  },
  localHtmlSaveError: {
    ru: 'Не удалось сохранить подготовленную HTML-страницу.',
    en: 'Failed to save the prepared HTML page.',
  },
  localHtmlSavePermissionDenied: {
    ru: 'Нет разрешения на запись в выбранный HTML-файл.',
    en: 'No write permission for the selected HTML file.',
  },
  localHtmlSaveUnsupported: {
    ru: 'Сохранение доступно только для локальных HTML-файлов с выбором файла.',
    en: 'Saving is available only for local HTML files with a file picker.',
  },
  localHtmlSaveBlockedHistory: {
    ru: 'Сохранение недоступно, пока изменение страницы ещё не завершено.',
    en: 'Saving is unavailable until the current page edit is finished.',
  },
});
