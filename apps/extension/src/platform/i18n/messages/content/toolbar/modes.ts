import { defineMessageSource } from '../../source';

const VIEWPORT_CONFLICT_ERROR_RU = [
  'Размер окна занят текущим снимком или записью.',
  'Завершите операцию и выберите размер снова.',
].join(' ');

const VIEWPORT_CONFLICT_ERROR_EN = [
  'A capture or recording is using this window size.',
  'Finish it, then select the size again.',
].join(' ');

export const contentToolbarModesMessages = defineMessageSource({
  pageCustomizeControls: { ru: 'Настроить кнопки панели', en: 'Customize toolbar buttons' },
  pageCustomizeControlsHint: {
    ru: 'Выберите, какие кнопки показывать.',
    en: 'Choose which buttons to show.',
  },
  pageControlOverride: {
    ru: 'Своя настройка для этого режима.',
    en: 'Custom visibility for this mode.',
  },
  pageInheritControls: { ru: 'Кнопки как в навигации', en: 'Use navigation visibility' },
  pageInheritControlsHint: {
    ru: 'Убрать свои настройки кнопок этого режима.',
    en: 'Remove this mode’s visibility overrides.',
  },
  pageControlVisible: { ru: 'Показывать «{tool}» на панели', en: 'Show {tool} on the toolbar' },
  pageShowHidden: { ru: 'Показать скрытые кнопки', en: 'Show hidden buttons' },
  pageShowHiddenHint: {
    ru: 'До закрытия панели. Сохранённые настройки не изменятся.',
    en: 'Until the toolbar closes. Saved preferences stay unchanged.',
  },
  recordingFadeToolbar: {
    ru: 'Приглушать панель при записи',
    en: 'Fade toolbar while recording',
  },
  recordingFadeToolbarHint: {
    ru: 'Полная видимость при наведении и работе с панелью.',
    en: 'Fully visible while you use the toolbar.',
  },
  recordingCustomizeControls: {
    ru: 'Настроить кнопки во время записи',
    en: 'Customize controls during recording',
  },
  recordingCustomizeDone: {
    ru: 'Завершить настройку кнопок',
    en: 'Finish customizing controls',
  },
  recordingShowHiddenControls: {
    ru: 'Показать скрытые кнопки',
    en: 'Show hidden buttons',
  },
  recordingHideHiddenControls: {
    ru: 'Свернуть дополнительные кнопки',
    en: 'Collapse additional buttons',
  },
  recordingControlVisible: {
    ru: 'Показывать «{tool}» во время записи',
    en: 'Show {tool} during recording',
  },
  videoRecordingPermissionTitle: {
    ru: 'Доступ к устройствам',
    en: 'Device access',
  },
  videoRecordingMicrophonePermissionTitle: {
    ru: 'Доступ к микрофону',
    en: 'Microphone access',
  },
  videoRecordingCameraPermissionTitle: {
    ru: 'Доступ к камере',
    en: 'Camera access',
  },
  videoRecordingMediaPermissionDescription: {
    ru: 'Подтвердите доступ в запросе Chrome. Запись не начнётся.',
    en: 'Confirm access in the Chrome prompt. Recording will not start.',
  },
  videoRecordingPermissionCancelled: {
    ru: 'Запрос доступа отменён.',
    en: 'The access request was cancelled.',
  },
  videoRecordingPermissionFailed: {
    ru: 'Не удалось открыть устройство. Проверьте подключение и попробуйте снова.',
    en: 'The device could not be opened. Check its connection and try again.',
  },
  videoRecordingPermissionDenied: {
    ru: 'Chrome не предоставил доступ к устройству.',
    en: 'Chrome did not allow access to the device.',
  },
  videoRecordingPermissionBlocked: {
    ru: 'Доступ заблокирован в Chrome.',
    en: 'Access is blocked in Chrome.',
  },
  videoRecordingPermissionSettings: {
    ru: 'Открыть разрешения',
    en: 'Open permissions',
  },
  videoRecordingPermissionSettingsFailed: {
    ru: 'Не удалось открыть настройки.',
    en: 'Chrome settings could not be opened.',
  },
  videoRecordingPermissionPolicy: {
    ru: 'Этот сайт не разрешает встроенный запрос доступа к устройству.',
    en: 'This site does not allow an embedded device access request.',
  },
  videoRecordingPermissionUnauthorized: {
    ru: 'Панель записи больше не активна. Откройте её снова.',
    en: 'The recording toolbar is no longer active. Open it again.',
  },
  videoRecordingWithoutMicrophone: {
    ru: 'Продолжить запись без микрофона?',
    en: 'Continue recording without a microphone?',
  },
  videoRecordingWithoutMicrophoneRemember: {
    ru: 'Больше не спрашивать',
    en: "Don't ask me again",
  },
  videoRecordingWithoutMicrophoneContinue: {
    ru: 'Продолжить',
    en: 'Continue',
  },
  cropResizeMode: { ru: 'Изменить область', en: 'Resize crop' },
  cropDrawingMode: { ru: 'Рисовать', en: 'Draw' },
  unknownError: {
    ru: 'Неизвестная ошибка',
    en: 'Unknown error',
  },
  videoRecordingActionFailed: {
    ru: 'Не удалось выполнить действие с записью. Повторите попытку.',
    en: 'The recording action failed. Try again.',
  },
  videoRecordingStartPermissionRequired: {
    ru: 'Chrome не разрешил захват вкладки. Откройте Sniptale через значок расширения и повторите запуск.',
    en: 'Chrome did not allow tab capture. Open Sniptale from the extension icon and try again.',
  },
  videoRecordingStartStaleContext: {
    ru: 'Страница изменилась. Обновите панель инструментов и повторите запуск.',
    en: 'The page changed. Refresh the toolbar and try again.',
  },
  videoRecordingStartInvalidSource: {
    ru: 'Эту вкладку нельзя записать. Выберите поддерживаемую страницу.',
    en: 'This tab cannot be recorded. Choose a supported page.',
  },
  videoRecordingStartViewportTooLarge: {
    ru: 'Выбранный размер окна не помещается на экране. Выберите другой размер в разделе «Видео».',
    en: 'The selected window size does not fit on this display. Choose another size in Video settings.',
  },
  videoRecordingStartViewportVerificationFailed: {
    ru: 'Chrome не смог применить выбранный размер окна. Выберите другой размер в разделе «Видео» и повторите запуск.',
    en: 'Chrome could not apply the selected window size. Choose another size in Video settings and try again.',
  },
  videoRecordingStartAlreadyActive: {
    ru: 'Запись уже запущена. Управляйте текущей записью.',
    en: 'A recording is already running. Use the current recording controls.',
  },
  videoRecordingStartCancelled: {
    ru: 'Запуск записи отменён. Можно повторить попытку.',
    en: 'Recording start was cancelled. You can try again.',
  },
  viewportConflictError: {
    ru: VIEWPORT_CONFLICT_ERROR_RU,
    en: VIEWPORT_CONFLICT_ERROR_EN,
  },
  viewportErrorPrefix: {
    ru: 'Не удалось применить размер:',
    en: 'Could not apply the size:',
  },
  viewportChangeError: {
    ru: 'Не удалось изменить размер окна',
    en: 'Could not change the window size',
  },
  navigationLockManaged: {
    ru: 'Блокировка автоматически управляется в режимах выделения/редактирования',
    en: 'Navigation lock is managed automatically in selection and editing modes',
  },
  navigationUnlock: {
    ru: 'Разблокировать навигацию',
    en: 'Unlock navigation',
  },
  navigationLock: {
    ru: 'Блокировать навигацию',
    en: 'Lock navigation',
  },
  navigationLockLabel: {
    ru: 'Блокировка навигации',
    en: 'Navigation lock',
  },
  cursorDefault: {
    ru: 'Обычная работа со страницей',
    en: 'Interact with the page normally',
  },
  cursorLabel: {
    ru: 'Навигация',
    en: 'Navigation',
  },
  cursorDescription: {
    ru: 'Пользуйтесь страницей как обычно: переходите по ссылкам, нажимайте кнопки и прокручивайте',
    en: 'Use the page normally: follow links, click buttons, and scroll',
  },
  cursorEnable: {
    ru: 'Вернуться к обычной работе со страницей',
    en: 'Return to normal page interaction',
  },
  drawingLabel: { ru: 'Рисование', en: 'Drawing' },
  drawingEnable: {
    ru: 'Рисуйте в любом месте поверх страницы: добавляйте линии, фигуры, стрелки и текст',
    en: 'Draw anywhere over the page with lines, shapes, arrows, and text',
  },
  videoRecordingLabel: { ru: 'Запись вкладки', en: 'Tab recording' },
  videoRecordingEnable: {
    ru: 'Записывайте вкладку или её область со звуком, камерой и пометками',
    en: 'Record the tab or a selected area with audio, camera, and markup',
  },
  videoRecordingPinned: {
    ru: 'Панель закреплена, пока выбран режим записи видео',
    en: 'The toolbar stays pinned while video recording mode is selected',
  },
  videoRecordingStart: { ru: 'Записать видео', en: 'Record video' },
  videoRecordingStartHint: {
    ru: 'Начать запись с текущими настройками из раздела «Видео» во всплывающем окне',
    en: 'Start recording with the current settings from the Video tab in the popup',
  },
  videoRecordingCancelStart: { ru: 'Отменить запуск', en: 'Cancel start' },
  videoRecordingPause: { ru: 'Пауза', en: 'Pause' },
  videoRecordingResume: { ru: 'Продолжить', en: 'Resume' },
  videoRecordingStop: { ru: 'Остановить запись', en: 'Stop recording' },
  videoRecordingStopping: { ru: 'Завершение записи', en: 'Finishing recording' },
  videoRecordingMicrophone: { ru: 'Микрофон', en: 'Microphone' },
  videoRecordingCamera: { ru: 'Камера', en: 'Camera' },
  videoRecordingCameraResize: { ru: 'Изменить размер камеры', en: 'Resize camera' },
  videoRecordingCameraPreviewUnavailable: {
    ru: 'Предпросмотр камеры недоступен',
    en: 'Camera preview is unavailable',
  },
  videoRecordingDevicesLoading: { ru: 'Загрузка устройств…', en: 'Loading devices…' },
  videoRecordingDevicesEmpty: { ru: 'Устройства не найдены', en: 'No devices found' },
  videoRecordingMedia: { ru: 'Микрофон и камера', en: 'Microphone and camera' },
  videoRecordingSpotlight: { ru: 'Эффекты курсора', en: 'Cursor effects' },
  cursorSettings: { ru: 'Настройки курсора', en: 'Cursor settings' },
  cursorNative: { ru: 'Системный курсор', en: 'System cursor' },
  cursorNativeDescription: {
    ru: 'Используется системный курсор: стрелка, рука, ввод текста и изменение размера. Его оформление остаётся под управлением браузера и системы.',
    en: 'The browser and operating system control the pointer, hand, text and resize cursors. Their appearance is unchanged.',
  },
  cursorEffectEnabled: { ru: 'Включено', en: 'Enabled' },
  cursorEffectColor: { ru: 'Цвет', en: 'Color' },
  cursorEffectSize: { ru: 'Размер', en: 'Size' },
  cursorEffectOpacity: { ru: 'Непрозрачность', en: 'Opacity' },
  cursorEffectRadius: { ru: 'Радиус подсветки', en: 'Spotlight radius' },
  cursorEffectDimming: { ru: 'Затемнение', en: 'Dimming' },
  cursorEffectDuration: { ru: 'Длительность', en: 'Duration' },
  cursorEffectSaveFailed: {
    ru: 'Не удалось сохранить настройку. Попробуйте ещё раз.',
    en: 'Could not save this setting. Try again.',
  },
  videoRecordingCursorHalo: { ru: 'Контур курсора', en: 'Cursor halo' },
  videoRecordingCursorDimming: { ru: 'Затемнение страницы', en: 'Dim page' },
  videoRecordingClickAnimation: { ru: 'Анимация клика', en: 'Click animation' },
  videoRecordingModeControls: { ru: 'Режим взаимодействия', en: 'Interaction mode' },
  videoRecordingActions: { ru: 'Управление записью', en: 'Recording controls' },
  drawingUnavailable: {
    ru: 'Рисование недоступно для страницы с несколькими независимыми областями прокрутки',
    en: 'Drawing is unavailable on pages with multiple independent scroll areas',
  },
  drawingPreferencesSaveError: {
    ru: 'Не удалось сохранить настройки рисования',
    en: 'Could not save drawing settings',
  },
  drawingTools: { ru: 'Инструменты рисования', en: 'Drawing tools' },
  drawingOptions: { ru: 'Настройки инструмента', en: 'Tool options' },
  drawingActions: { ru: 'Действия с рисунками', en: 'Drawing actions' },
  drawingCanvas: { ru: 'Холст рисования', en: 'Drawing canvas' },
  drawingTextInput: { ru: 'Текст на холсте', en: 'Drawing text' },
  drawingObjects: { ru: 'Нарисованные объекты', en: 'Drawing objects' },
  drawingObject: { ru: 'Объект', en: 'Object' },
  drawingSelect: { ru: 'Выбор', en: 'Select' },
  drawingSelectModifierHint: {
    ru: 'Потяните по пустому месту — выбор областью; Shift — добавить; Ctrl — переключить',
    en: 'Drag empty space for area selection; Shift — add; Ctrl — toggle',
  },
  drawingPencil: { ru: 'Карандаш', en: 'Pencil' },
  drawingStrokeModifierHint: {
    ru: 'Ctrl — прямая без привязки; Shift — прямая с шагом 15°',
    en: 'Ctrl — unsnapped straight line; Shift — straight line in 15° steps',
  },
  drawingMarker: { ru: 'Маркер', en: 'Marker' },
  drawingShape: { ru: 'Фигуры', en: 'Shapes' },
  drawingShapeModifierHint: {
    ru: 'Shift — фигура с равными сторонами',
    en: 'Shift — shape with equal sides',
  },
  drawingRectangle: { ru: 'Рамка', en: 'Frame' },
  drawingEllipse: { ru: 'Круг', en: 'Circle' },
  drawingTriangle: { ru: 'Треугольник', en: 'Triangle' },
  drawingParallelogram: { ru: 'Параллелограмм', en: 'Parallelogram' },
  drawingArrow: { ru: 'Стрелка', en: 'Arrow' },
  drawingArrowModifierHint: {
    ru: 'Свободный угол; Shift — шаг 15°',
    en: 'Free angle; Shift — 15° steps',
  },
  drawingArrowUniformWidth: { ru: 'Равномерная толщина', en: 'Uniform width' },
  drawingArrowDynamicWidth: { ru: 'Динамическая толщина', en: 'Dynamic width' },
  drawingArrowFreehand: { ru: 'Рисованная стрелка', en: 'Freehand arrow' },
  drawingBlur: { ru: 'Размытие', en: 'Blur' },
  drawingText: { ru: 'Текст', en: 'Text' },
  drawingTextModifierHint: {
    ru: 'Shift+Enter — новая строка',
    en: 'Shift+Enter — new line',
  },
  drawingTextColor: { ru: 'Цвет текста', en: 'Text color' },
  drawingTextBackground: { ru: 'Цвет фона', en: 'Background color' },
  drawingNoBackground: { ru: 'Без фона', en: 'No background' },
  drawingFillColor: { ru: 'Цвет заливки', en: 'Fill color' },
  drawingNoFill: { ru: 'Без заливки', en: 'No fill' },
  drawingEnableFill: { ru: 'Включить заливку', en: 'Enable fill' },
  drawingDisableFill: { ru: 'Убрать заливку', en: 'Remove fill' },
  drawingColor: { ru: 'Цвет', en: 'Color' },
  drawingWidth: { ru: 'Толщина', en: 'Width' },
  drawingOpacity: { ru: 'Прозрачность', en: 'Opacity' },
  drawingBlurWeak: { ru: 'Слабое', en: 'Weak' },
  drawingBlurStrength: { ru: 'Сила размытия', en: 'Blur strength' },
  drawingBlurMedium: { ru: 'Среднее', en: 'Medium' },
  drawingBlurStrong: { ru: 'Сильное', en: 'Strong' },
  drawingTextSize: { ru: 'Размер текста', en: 'Text size' },
  drawingTextFontSans: { ru: 'Без засечек', en: 'Sans serif' },
  drawingTextFontSerif: { ru: 'С засечками', en: 'Serif' },
  drawingTextFontMono: { ru: 'Моноширинный', en: 'Monospace' },
  drawingTextFontHandwritten: { ru: 'Рукописный', en: 'Handwritten' },
  drawingDeselect: { ru: 'Снять выделение', en: 'Deselect' },
  drawingDelete: { ru: 'Удалить выбранное', en: 'Delete selected' },
  drawingClear: { ru: 'Очистить рисунки', en: 'Clear drawings' },
  recordingNavigation: { ru: 'Навигация', en: 'Navigation' },
  recordingDrawingEraser: { ru: 'Ластик', en: 'Eraser' },
  recordingDrawingAutoHide: {
    ru: 'Автоматически скрывать рисунки',
    en: 'Automatically hide drawings',
  },
  recordingDrawingAutoHideOff: { ru: 'Выключено', en: 'Off' },
  recordingDrawingAutoHideSeconds: { ru: 'секунд', en: 'seconds' },
  aiLabel: {
    ru: 'ИИ-редактор',
    en: 'AI editor',
  },
  aiDisable: {
    ru: 'Закрыть ИИ-редактор',
    en: 'Close AI editor',
  },
  aiEnable: {
    ru: 'Выберите элемент на странице и опишите изменение',
    en: 'Select a page element and describe the change',
  },
  quickEditLabel: {
    ru: 'Правка текста',
    en: 'Text editing',
  },
  quickEditDisable: {
    ru: 'Отключить редактирование контента',
    en: 'Disable content editing',
  },
  quickEditEnable: {
    ru: 'Меняйте текст прямо на странице — вручную или с помощью ИИ',
    en: 'Change text directly on the page, manually or with AI',
  },
  quickEditBlockSelectionLabel: {
    ru: 'Выбор блоков',
    en: 'Select blocks',
  },
  quickEditBlockSelectionEnable: {
    ru: 'Выбирать блоки для редактирования',
    en: 'Select blocks to edit',
  },
  designReviewLabel: {
    ru: 'Дизайн-ревью',
    en: 'Design review',
  },
  designReviewEnable: {
    ru: 'Проверяйте размеры и отступы, меняйте оформление элементов и оставляйте замечания',
    en: 'Check dimensions and spacing, adjust element styles, and leave feedback',
  },
  quickEditDocumentModeLabel: {
    ru: 'Редактирование текста',
    en: 'Edit text directly',
  },
  quickEditDocumentModeEnable: {
    ru: 'Редактировать текст прямо на странице',
    en: 'Edit text directly on the page',
  },
  quickEditDocumentModeDisable: {
    ru: 'Выключить свободное редактирование',
    en: 'Turn off free text edit',
  },
  highlighterLabel: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  highlighterDisable: {
    ru: 'Отключить аннотации',
    en: 'Disable annotations',
  },
  highlighterEnable: {
    ru: 'Выбирайте элементы страницы и добавляйте к ним рамки, выноски и номера',
    en: 'Select page elements and add frames, callouts, and numbers to them',
  },
  clearPagePreparation: {
    ru: 'Сбросить всё',
    en: 'Reset all',
  },
  clearDrawings: {
    ru: 'Очистить рисунки',
    en: 'Clear drawings',
  },
  clearAnnotations: {
    ru: 'Очистить аннотации',
    en: 'Clear annotations',
  },
  restorePageContent: {
    ru: 'Восстановить содержимое',
    en: 'Restore page content',
  },
  clearReviewChanges: {
    ru: 'Сбросить правки и замечания',
    en: 'Clear edits and feedback',
  },
  resetPagePreparationMessage: {
    ru: 'Сбросить все изменения Sniptale на этой странице за текущую сессию?',
    en: 'Reset all Sniptale changes on this page from the current session?',
  },
  modeChangesCleared: {
    ru: 'Изменения текущего режима сброшены',
    en: 'Changes in the current mode reset',
  },
  resetDrawingMessage: {
    ru: 'Удалить все рисунки с этой страницы? Изменения в других режимах останутся.',
    en: 'Remove all drawings from this page? Changes in other modes will be kept.',
  },
  resetAnnotationMessage: {
    ru: 'Удалить все рамки, эффекты и аннотации? Изменения в других режимах останутся.',
    en: 'Remove all frames, effects and annotations? Changes in other modes will be kept.',
  },
  resetContentEditingMessage: {
    ru: 'Восстановить исходное содержимое страницы? Изменения в других режимах останутся.',
    en: 'Restore the original page content? Changes in other modes will be kept.',
  },
  resetDesignReviewMessage: {
    ru: 'Отменить правки текста и свойств, удалить все замечания? Изменения в других режимах останутся.',
    en: 'Undo text and property edits and remove all feedback? Changes in other modes will be kept.',
  },
  autoBlur: {
    ru: 'Размытие данных',
    en: 'Sensitive data blur',
  },
  modeMenuTitle: {
    ru: 'Режим работы',
    en: 'Working mode',
  },
  settingsLabel: {
    ru: 'Настройки панели',
    en: 'Toolbar settings',
  },
  settingsMenuTitle: {
    ru: 'Настройки панели',
    en: 'Toolbar settings',
  },
  panelFreePlacement: {
    ru: 'Свободное размещение панели',
    en: 'Free toolbar placement',
  },
  panelFreePlacementHint: {
    ru: 'Перемещать панель свободно и выбирать её ориентацию вручную',
    en: 'Move the toolbar freely and choose its orientation manually',
  },
  panelHorizontal: {
    ru: 'Горизонтальный вид',
    en: 'Horizontal view',
  },
  panelHorizontalHint: {
    ru: 'Расположить кнопки в одну строку',
    en: 'Arrange buttons in one row',
  },
  panelVertical: {
    ru: 'Вертикальный вид',
    en: 'Vertical view',
  },
  panelVerticalHint: {
    ru: 'Расположить секции друг под другом',
    en: 'Stack sections vertically',
  },
  compactMenus: {
    ru: 'Компактный вид меню',
    en: 'Compact menu view',
  },
  compactMenusHint: {
    ru: 'Скрыть описания и уменьшить высоту пунктов меню',
    en: 'Hide descriptions and reduce the height of menu items',
  },
  pinToTab: {
    ru: 'Закрепить панель во вкладке',
    en: 'Pin toolbar to this tab',
  },
  pinToTabHint: {
    ru: 'Снова показывать панель после обновления этой вкладки',
    en: 'Show the toolbar again after this tab is refreshed',
  },
  pinToTabLockedHint: {
    ru: 'Панель закреплена, пока включён сценарий',
    en: 'The toolbar stays pinned while scenario mode is on',
  },
  pinToTabAutoBlurLockedHint: {
    ru: 'Выключите авторазмытие данных, чтобы открепить панель',
    en: 'Turn off automatic data blur before unpinning the toolbar',
  },
  pinToTabUnavailableHint: {
    ru: 'Разрешите расширению доступ ко всем сайтам, чтобы панель восстанавливалась после переходов',
    en: 'Allow the extension on all sites so the toolbar can return after navigation',
  },
  hideToolbar: {
    ru: 'Свернуть',
    en: 'Collapse',
  },
  screenshotDisable: {
    ru: 'Очистить и закрыть',
    en: 'Clear and close',
  },
  screenshotDisableError: {
    ru: 'Не удалось закрыть панель. Повторите попытку.',
    en: 'Could not close the toolbar. Try again.',
  },
  screenshotEnable: {
    ru: 'Перейти в режим снимка',
    en: 'Enter screenshot mode',
  },
});
