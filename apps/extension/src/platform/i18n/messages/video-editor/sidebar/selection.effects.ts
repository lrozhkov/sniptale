import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionEffectMessages = defineMessageSource({
  historyDuration: { ru: 'Длительность', en: 'Duration' },
  historyOffset: { ru: 'Смещение', en: 'Offset' },
  historyEventMode: { ru: 'Визуализация', en: 'Visualization' },
  historyInherit: { ru: 'Настройки истории', en: 'History settings' },
  historyForceOn: { ru: 'Включено для события', en: 'Enabled for event' },
  historyForceOff: { ru: 'Отключено для события', en: 'Disabled for event' },
  historyReset: { ru: 'Сбросить изменения события', en: 'Reset event overrides' },
  historyEventLabel: { ru: 'Событие', en: 'Event' },
  historyEventKind: { ru: 'Тип события', en: 'Event type' },
  historySettings: { ru: 'Настройки', en: 'Settings' },
  historyOverridden: { ru: 'Индивидуальные', en: 'Custom' },
  historyTrackDisabled: { ru: 'История отключена', en: 'History disabled' },
  historySuppressed: { ru: 'Пропущено: близкое событие', en: 'Suppressed: nearby event' },
  historyKeysDisabled: { ru: 'Клавиши скрыты', en: 'Keystrokes hidden' },
  historyUnsupported: { ru: 'Без визуализации', en: 'No visualization' },
  historyOutsideSource: { ru: 'Вне исходного фрагмента', en: 'Outside source clip' },
  historyVisible: { ru: 'Отображается', en: 'Visible' },
  historyEnabled: { ru: 'Визуализация истории', en: 'History visualization' },
  historySuppression: { ru: 'Интервал между акцентами', en: 'Accent interval' },
  historyShowKeys: { ru: 'Показывать нажатия клавиш', en: 'Show keystrokes' },
  framingBinding: { ru: 'Привязка', en: 'Binding' },
  framingBindingScene: { ru: 'Сцена', en: 'Scene' },
  framingExactPosition: { ru: 'Точное положение', en: 'Exact position' },
  framingPreviewLabel: { ru: 'Положение области кадрирования', en: 'Framing area position' },
  framingAreaPreviewHint: {
    ru: 'Перетащите область или её углы. Сплошная рамка — итоговый кадр.',
    en: 'Drag the area or its corners. The solid outline shows the resulting frame.',
  },
  framingPreviewHint: {
    ru: 'Переместите область мышью или стрелками',
    en: 'Move the area with the pointer or arrow keys',
  },
  framingPreviewLoading: { ru: 'Загрузка кадра…', en: 'Loading frame…' },
  framingPreviewFailed: { ru: 'Не удалось загрузить кадр', en: 'Could not load frame' },
  projectSourceLabel: {
    ru: 'Источник проекта',
    en: 'Project source',
  },
  projectSourceManual: {
    ru: 'Собран вручную в редакторе',
    en: 'Built manually in the editor',
  },
  projectSourceRecording: {
    ru: 'Создан из записи экрана',
    en: 'Created from a screen recording',
  },
  projectSourceScenario: {
    ru: 'Собран из сценария',
    en: 'Built from a scenario',
  },
  actionsTitle: {
    ru: 'Действия',
    en: 'Actions',
  },
  actionsEmpty: {
    ru: 'События ещё не добавлены',
    en: 'No events have been added yet',
  },
  addClickRipple: {
    ru: 'Клик-акцент',
    en: 'Click ripple',
  },
  actionTimePrefix: {
    ru: 'Время:',
    en: 'Time:',
  },
  actionTimeSecondsSuffix: {
    ru: 'с',
    en: 's',
  },
  actionPresetLabel: {
    ru: 'Шаблон',
    en: 'Preset',
  },
  temporalEasingLinear: {
    ru: 'Линейно',
    en: 'Linear',
  },
  temporalEasingEaseOut: {
    ru: 'Плавное замедление',
    en: 'Ease out',
  },
  temporalEasingEaseInOut: {
    ru: 'Плавно',
    en: 'Ease in-out',
  },
  temporalEasingInstant: {
    ru: 'Мгновенно',
    en: 'Instant',
  },
  motionScaleLabel: {
    ru: 'Масштаб зума',
    en: 'Zoom scale',
  },
  motionCameraModeLabel: {
    ru: 'Режим зума',
    en: 'Zoom mode',
  },
  motionCameraModeStatic: {
    ru: 'Статика',
    en: 'Static',
  },
  motionCameraModePath: {
    ru: 'Движение',
    en: 'Moving',
  },
  motionDurationLabel: {
    ru: 'Длительность',
    en: 'Duration',
  },
  motionZoomInLabel: {
    ru: 'Приблизить',
    en: 'Zoom in',
  },
  motionZoomOutLabel: {
    ru: 'Отдалить',
    en: 'Zoom out',
  },
  motionFocusLabel: {
    ru: 'Фокус',
    en: 'Focus',
  },
  motionFocusManual: {
    ru: 'Ручная точка',
    en: 'Manual point',
  },
  motionFocusManualArea: {
    ru: 'Ручная область',
    en: 'Manual area',
  },
  motionFocusCursor: {
    ru: 'Следовать за курсором',
    en: 'Follow cursor',
  },
  motionFocusAction: {
    ru: 'Следовать за действием',
    en: 'Follow action',
  },
  motionEasingLabel: {
    ru: 'Сглаживание камеры',
    en: 'Camera easing',
  },
  motionBlurLabel: {
    ru: 'Смазывание в движении',
    en: 'Motion blur',
  },
  motionOverlayZoomLabel: {
    ru: 'Наложения',
    en: 'Overlays',
  },
  motionOverlayZoomLock: {
    ru: 'Фиксировать',
    en: 'Lock',
  },
  motionOverlayZoomFollowCamera: {
    ru: 'Вместе с зумом',
    en: 'Follow zoom',
  },
  motionTargetActionLabel: {
    ru: 'Целевое действие',
    en: 'Target action',
  },
  motionTargetActionNone: {
    ru: 'Без привязки',
    en: 'No target',
  },
  motionFocusXLabel: {
    ru: 'Фокус X',
    en: 'Focus X',
  },
  motionFocusYLabel: {
    ru: 'Фокус Y',
    en: 'Focus Y',
  },
  motionAreaXLabel: {
    ru: 'Область X',
    en: 'Area X',
  },
  motionAreaYLabel: {
    ru: 'Область Y',
    en: 'Area Y',
  },
  motionAreaWidthLabel: {
    ru: 'Ширина области',
    en: 'Area width',
  },
  motionAreaHeightLabel: {
    ru: 'Высота области',
    en: 'Area height',
  },
  actionPresetNone: {
    ru: 'Без анимации',
    en: 'No animation',
  },
  actionPresetClickRipple: {
    ru: 'Пульс клика',
    en: 'Click ripple',
  },
  actionPresetSpotlight: {
    ru: 'Подсветка',
    en: 'Spotlight',
  },
  actionPresetDwellZoom: {
    ru: 'Задержка с приближением',
    en: 'Dwell zoom',
  },
  actionPresetScrollEmphasis: {
    ru: 'Акцент скролла',
    en: 'Scroll emphasis',
  },
  selectPointOnStage: {
    ru: 'Указать на сцене',
    en: 'Pick on stage',
  },
  selectAreaOnStage: {
    ru: 'Указать область',
    en: 'Pick area',
  },
  resetPointToCenter: {
    ru: 'Сбросить в центр',
    en: 'Reset to center',
  },
  resetAreaToCenter: {
    ru: 'Сбросить область',
    en: 'Reset area',
  },
  resizeAreaOnStage: {
    ru: 'Изменить область',
    en: 'Resize area',
  },
  actionPointLabel: {
    ru: 'Точка действия',
    en: 'Action point',
  },
  actionPointXLabel: {
    ru: 'Точка X',
    en: 'Point X',
  },
  actionPointYLabel: {
    ru: 'Точка Y',
    en: 'Point Y',
  },
  actionPointPickHint: {
    ru: 'Кликните по полотну, чтобы установить точку действия.',
    en: 'Click on the canvas to place the action point.',
  },
  motionFocusPickHint: {
    ru: 'Кликните по полотну, чтобы установить точку фокуса.',
    en: 'Click on the canvas to place the focus point.',
  },
  motionAreaPickHint: {
    ru: 'Протяните по полотну, чтобы задать область зума.',
    en: 'Drag on the canvas to define the zoom area.',
  },
});
