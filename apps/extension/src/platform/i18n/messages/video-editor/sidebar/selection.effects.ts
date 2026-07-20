import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionEffectMessages = defineMessageSource({
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
    ru: 'Пресет',
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
    ru: 'Масштаб камеры',
    en: 'Camera scale',
  },
  motionCameraModeLabel: {
    ru: 'Режим камеры',
    en: 'Camera mode',
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
