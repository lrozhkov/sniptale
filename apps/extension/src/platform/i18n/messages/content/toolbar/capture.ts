import { defineMessageSource } from '../../source';

export const contentToolbarCaptureMessages = defineMessageSource({
  captureDownloadLabel: {
    ru: 'Скачать',
    en: 'Download',
  },
  captureDownloadHint: {
    ru: 'Сохранить снимок в папку загрузок по умолчанию',
    en: 'Save the screenshot to the default Downloads folder',
  },
  captureAskPresetLabel: {
    ru: 'Выбрать папку',
    en: 'Choose a folder',
  },
  captureAskPresetHint: {
    ru: 'Выбрать одну из сохранённых папок внутри «Загрузок»',
    en: 'Choose one of your saved folders inside Downloads',
  },
  captureAskSystemLabel: {
    ru: 'Сохранить как…',
    en: 'Save as…',
  },
  captureAskSystemHint: {
    ru: 'Выбрать имя файла и папку в системном окне',
    en: 'Choose a file name and folder in the system dialog',
  },
  captureCopyLabel: {
    ru: 'Копировать изображение',
    en: 'Copy image',
  },
  captureCopyHint: {
    ru: 'Скопировать снимок в буфер обмена',
    en: 'Copy the screenshot to the clipboard',
  },
  captureScenarioLabel: {
    ru: 'Добавить в сценарий',
    en: 'Add to scenario',
  },
  captureSaveToLibraryLabel: {
    ru: 'Сохранить в библиотеку',
    en: 'Save to library',
  },
  captureSaveToLibraryHint: {
    ru: 'Сохранить снимок в локальной библиотеке',
    en: 'Save the capture to the local library',
  },
  captureScenarioHint: {
    ru: 'Создать шаг сценария с этим снимком',
    en: 'Create a scenario step with this screenshot',
  },
  captureEditLabel: {
    ru: 'Открыть в редакторе',
    en: 'Open in editor',
  },
  captureEditHint: {
    ru: 'Отредактировать снимок перед сохранением',
    en: 'Edit the screenshot before saving',
  },
  timerNoneLabel: {
    ru: 'Без задержки',
    en: 'No delay',
  },
  timerNoneHint: {
    ru: 'Сделать снимок сразу после нажатия',
    en: 'Take the screenshot immediately after the click',
  },
  timerThreeLabel: {
    ru: '3 секунды',
    en: '3 seconds',
  },
  timerThreeHint: {
    ru: 'Хватит, чтобы открыть меню или подсказку',
    en: 'Enough time to open a menu or tooltip',
  },
  timerFiveLabel: {
    ru: '5 секунд',
    en: '5 seconds',
  },
  timerFiveHint: {
    ru: 'Время, чтобы подготовить страницу к снимку',
    en: 'Enough time to prepare the page for the screenshot',
  },
  timerTenLabel: {
    ru: '10 секунд',
    en: '10 seconds',
  },
  timerTenHint: {
    ru: 'Время, чтобы открыть вложенные меню и вернуться к странице',
    en: 'Enough time to open nested menus and return to the page',
  },
  afterCaptureCopy: {
    ru: 'После снимка: Копировать изображение',
    en: 'After screenshot: Copy image',
  },
  afterCaptureScenario: {
    ru: 'После снимка: Добавить в сценарий',
    en: 'After screenshot: Add to scenario',
  },
  afterCaptureSaveToLibrary: {
    ru: 'После снимка: сохранить в библиотеку',
    en: 'After capture: save to library',
  },
  afterCaptureEdit: {
    ru: 'После снимка: Открыть в редакторе',
    en: 'After screenshot: Open in editor',
  },
  afterCaptureAskPreset: {
    ru: 'После снимка: Выбрать папку',
    en: 'After screenshot: Choose a folder',
  },
  afterCaptureAskSystem: {
    ru: 'После снимка: Сохранить как…',
    en: 'After screenshot: Save as…',
  },
  afterCaptureDownload: {
    ru: 'После снимка: Скачать',
    en: 'After screenshot: Download',
  },
  visibleArea: {
    ru: 'Снимок видимой области',
    en: 'Capture visible area',
  },
  fullPage: {
    ru: 'Снимок всей страницы',
    en: 'Capture full page',
  },
  fullPageSettingsTitle: {
    ru: 'Параметры снимка всей страницы',
    en: 'Full-page capture settings',
  },
  fullPageFloatingTitle: {
    ru: 'Плавающие элементы',
    en: 'Floating elements',
  },
  fullPageFloatingOnce: {
    ru: 'Показать один раз',
    en: 'Show once',
  },
  fullPageFloatingOnceHint: {
    ru: 'Закреплённые элементы попадут в итоговый снимок только один раз',
    en: 'Pinned elements appear only once in the final screenshot',
  },
  fullPageFloatingHide: {
    ru: 'Скрыть',
    en: 'Hide',
  },
  fullPageFloatingHideHint: {
    ru: 'Не добавлять закреплённые элементы в итоговый снимок',
    en: 'Exclude pinned elements from the final screenshot',
  },
  fullPageFloatingRepeat: {
    ru: 'Повторять',
    en: 'Repeat',
  },
  fullPageFloatingRepeatHint: {
    ru: 'Оставлять закреплённые элементы в каждом видимом фрагменте',
    en: 'Keep pinned elements in every visible tile',
  },
  fullPageLazyContent: {
    ru: 'Загрузить ленивый контент',
    en: 'Load lazy content',
  },
  fullPageLazyContentHint: {
    ru: 'Прокрутить страницу перед снимком, чтобы подгрузить изображения и блоки',
    en: 'Warm up the page before capture so images and sections can load',
  },
  fullPageFreezeMotion: {
    ru: 'Остановить анимации и видео',
    en: 'Pause animations and video',
  },
  fullPageFreezeMotionHint: {
    ru: 'Приостановить CSS-анимации и воспроизводимое видео на время снимка',
    en: 'Pause CSS animations and playing video while the screenshot is captured',
  },
  fullPageCustomViewportHint: {
    ru: 'Снимок использует активный пользовательский размер окна.',
    en: 'Capture uses the active custom window size.',
  },
  fullPageSettingsSaveError: {
    ru: 'Не удалось сохранить параметры снимка всей страницы',
    en: 'Could not save full-page capture settings',
  },
  selectionArea: {
    ru: 'Выбрать область для снимка',
    en: 'Select an area to capture',
  },
  afterCaptureTitle: {
    ru: 'После снимка',
    en: 'After screenshot',
  },
  selectionCaptureActionTitle: {
    ru: 'Сделать снимок и…',
    en: 'Capture and…',
  },
  screenshotDelayTooltip: {
    ru: 'Задержка перед снимком',
    en: 'Delay before screenshot',
  },
  timerBadgeSuffix: {
    ru: 'с',
    en: 's',
  },
  delayTitle: {
    ru: 'Задержка перед снимком',
    en: 'Delay before screenshot',
  },
  viewportButton: {
    ru: 'Размер окна для снимка',
    en: 'Window size for screenshot',
  },
  viewportMenuTitle: {
    ru: 'Размер окна',
    en: 'Window size',
  },
  viewportNativeLabel: {
    ru: 'Текущий размер',
    en: 'Current size',
  },
  viewportNativeHint: {
    ru: 'Использовать текущий размер окна для снимков',
    en: 'Use the current window size for screenshots',
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
