import { defineMessageSource } from '../../source';

export const videoEditorSidebarSelectionCursorMessages = defineMessageSource({
  cursorTitle: {
    ru: 'Курсор',
    en: 'Cursor',
  },
  cursorEnabled: {
    ru: 'Трек курсора активен',
    en: 'Cursor track is active',
  },
  cursorDisabled: {
    ru: 'Курсор пока не добавлен в проект',
    en: 'The cursor has not been added to the project yet',
  },
  enableCursorTrack: {
    ru: 'Включить курсор',
    en: 'Enable cursor',
  },
  cursorCaptureModeLabel: {
    ru: 'Режим захвата',
    en: 'Capture mode',
  },
  cursorCaptureModeSeparate: {
    ru: 'Редактируемый слой курсора',
    en: 'Editable cursor layer',
  },
  cursorCaptureModeFallback: {
    ru: 'Дополнительный курсор поверх видео',
    en: 'Additional cursor over video',
  },
  cursorColorLabel: {
    ru: 'Цвет курсора',
    en: 'Cursor color',
  },
  cursorPresetLabel: {
    ru: 'Форма курсора',
    en: 'Cursor shape',
  },
  cursorPresetArrow: {
    ru: 'Стрелка',
    en: 'Arrow',
  },
  cursorPresetDot: {
    ru: 'Точка',
    en: 'Dot',
  },
  cursorPresetRing: {
    ru: 'Кольцо',
    en: 'Ring',
  },
  cursorPresetCrosshair: {
    ru: 'Прицел',
    en: 'Crosshair',
  },
  cursorAnimationLabel: {
    ru: 'Анимация',
    en: 'Animation',
  },
  cursorAnimationNone: {
    ru: 'Без анимации',
    en: 'No animation',
  },
  cursorAnimationPulse: {
    ru: 'Пульс',
    en: 'Pulse',
  },
  cursorAnimationFloat: {
    ru: 'Плавание',
    en: 'Float',
  },
  cursorAnimationBreathe: {
    ru: 'Дыхание',
    en: 'Breathe',
  },
  cursorScaleLabel: {
    ru: 'Масштаб',
    en: 'Scale',
  },
  cursorShadowLabel: {
    ru: 'Тень курсора',
    en: 'Cursor shadow',
  },
  cursorVisibleLabel: {
    ru: 'Показывать курсор',
    en: 'Show cursor',
  },
  cursorInterpolationLabel: {
    ru: 'Интерполяция',
    en: 'Interpolation',
  },
  cursorTrackAppearanceTitle: {
    ru: 'Внешний вид дорожки',
    en: 'Track appearance',
  },
  objectTracksTitle: {
    ru: 'Распознанные объекты',
    en: 'Detected objects',
  },
  objectTrackKindCursor: {
    ru: 'Курсор',
    en: 'Cursor',
  },
  objectTrackKindVisualCursor: {
    ru: 'Визуальный курсор',
    en: 'Visual cursor',
  },
  objectTrackKindObject: {
    ru: 'Объект',
    en: 'Object',
  },
  objectTrackSourceManual: {
    ru: 'Ручная разметка',
    en: 'Manual markup',
  },
  objectTrackSourceTelemetry: {
    ru: 'История действий',
    en: 'Action history',
  },
  objectTrackSourceVisualDetection: {
    ru: 'По пикселям',
    en: 'Pixel detection',
  },
  objectTrackSourceLabel: {
    ru: 'Источник',
    en: 'Source',
  },
  objectTrackDetectorLabel: {
    ru: 'Детектор',
    en: 'Detector',
  },
  objectTrackSamplesLabel: {
    ru: 'Сэмплы',
    en: 'Samples',
  },
  objectTrackVisibleSamplesLabel: {
    ru: 'Видимые',
    en: 'Visible',
  },
  objectTrackConfidenceLabel: {
    ru: 'Confidence',
    en: 'Confidence',
  },
  objectTrackTimeRangeLabel: {
    ru: 'Диапазон',
    en: 'Range',
  },
  objectTrackDeleteLabel: {
    ru: 'Удалить трек',
    en: 'Delete track',
  },
  objectTrackSelectLabel: {
    ru: 'Выбрать цель',
    en: 'Select target',
  },
  objectTrackSelectedLabel: {
    ru: 'Цель выбрана',
    en: 'Target selected',
  },
  cursorDetectionRun: {
    ru: 'Распознать курсор',
    en: 'Detect cursor',
  },
  cursorDetectionRunAgain: {
    ru: 'Распознать заново',
    en: 'Detect again',
  },
  cursorDetectionCancel: {
    ru: 'Отмена',
    en: 'Cancel',
  },
  cursorDetectionRetry: {
    ru: 'Повторить',
    en: 'Retry',
  },
  cursorDetectionProgress: {
    ru: 'Обработка {progress}% · {processed}/{total} кадров',
    en: 'Processing {progress}% · {processed}/{total} frames',
  },
  cursorDetectionAssetMissing: {
    ru: 'Видео еще не готово для анализа.',
    en: 'The video is not ready for analysis yet.',
  },
  cursorDetectionReadyForZoom: {
    ru: 'Траектория курсора готова для зума',
    en: 'Cursor path is ready for zoom',
  },
  cursorDetectionNeedsCorrection: {
    ru: 'Нужно больше точек курсора',
    en: 'More cursor points are needed',
  },
  cursorDetectionVisibleSamples: {
    ru: 'Найдено точек: {count}',
    en: 'Detected points: {count}',
  },
  objectTrackAnchorPickHint: {
    ru: 'Кликните по позиции курсора на сцене.',
    en: 'Click the cursor position on the stage.',
  },
  objectTrackCorrectionPlace: {
    ru: 'Поставить коррекцию на сцене',
    en: 'Place correction on stage',
  },
  objectTrackRecalculateLocal: {
    ru: 'Пересчитать участок',
    en: 'Recalculate segment',
  },
  objectTrackLowConfidenceSummary: {
    ru: 'Низкая уверенность: {count}',
    en: 'Low confidence: {count}',
  },
  cursorAppearanceModeLabel: {
    ru: 'Режим оформления',
    en: 'Appearance mode',
  },
  cursorAppearanceModeTrack: {
    ru: 'Общие настройки дорожки',
    en: 'Track settings',
  },
  cursorAppearanceModeOverride: {
    ru: 'Индивидуальные настройки сегмента',
    en: 'Segment override',
  },
  cursorAppearanceTrackLinkHint: {
    ru: 'Сегмент использует общий стиль дорожки курсора.',
    en: 'This segment uses the shared cursor track style.',
  },
  cursorAppearanceOverrideHint: {
    ru: 'Для этого сегмента включён собственный стиль поверх общих настроек дорожки.',
    en: 'This segment uses its own style instead of the shared track settings.',
  },
  cursorAppearanceUnlink: {
    ru: 'Разорвать связь с дорожкой',
    en: 'Unlink from track',
  },
  cursorAppearanceRestoreTrack: {
    ru: 'Вернуть настройки дорожки',
    en: 'Restore track settings',
  },
  cursorFallbackHint: {
    ru: 'Настройки и удаление действуют только на дополнительный курсор. Курсор, записанный в видео, останется: удалить его этими настройками нельзя.',
    en: 'Settings and deletion affect only the additional cursor. The cursor recorded in the video remains and cannot be removed with these controls.',
  },
});
