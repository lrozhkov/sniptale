import { defineMessageSource } from '../../source';
import { videoEditorSidebarSelectionAnnotationMessages } from './selection.annotation.ts';
import { videoEditorSidebarSelectionStyleMessages } from './selection.core-style.ts';

export const videoEditorSidebarSelectionCoreMessages = defineMessageSource({
  typingSelection: { ru: 'Набор текста', en: 'Typing interval' },
  typingCurrentRate: { ru: 'Текущая скорость', en: 'Current speed' },
  typingTargetRate: { ru: 'Новая скорость', en: 'Target speed' },
  typingPreview: { ru: 'Рассчитать', en: 'Calculate' },
  typingApply: { ru: 'Применить', en: 'Apply' },
  typingUnavailable: { ru: 'Интервал недоступен', en: 'Interval unavailable' },
  typingLocked: { ru: 'Дорожка заблокирована', en: 'Track is locked' },
  typingStale: {
    ru: 'Проект изменился. Рассчитайте изменения заново.',
    en: 'The project changed. Preview changes again.',
  },
  typingDuration: { ru: 'Длительность интервала', en: 'Interval duration' },
  typingTail: { ru: 'Сдвиг следующих клипов', en: 'Following clips shifted' },
  typingProjectDelta: { ru: 'Сокращение проекта', en: 'Project shortened by' },
  typingLinked: { ru: 'Затронутые клипы', en: 'Affected clips' },
  typingSeconds: { ru: 'с', en: 's' },
  typingUnchanged: {
    ru: 'Скорость уже совпадает — изменений нет.',
    en: 'Speed already matches. No changes.',
  },
  typingBlocked: {
    ru: 'Ускорение недоступно для этого интервала: проверьте блокировки, переходы и связанные клипы.',
    en: 'This interval cannot be accelerated. Check locks, transitions and linked clips.',
  },
  actionSharedOccurrencesHint: {
    en: 'Settings apply to every appearance of this action in this source instance.',
    ru: 'Настройки действуют на все появления этого действия в данном экземпляре источника.',
  },
  sourceIn: { ru: 'In исходника', en: 'Source In' },
  sourceOut: { ru: 'Out исходника', en: 'Source Out' },
  sourceRangeHint: {
    ru: 'Время в исходнике. Out — граница окончания фрагмента.',
    en: 'Source time. Out is the boundary after the selected range.',
  },
  nothingSelected: {
    ru: 'Ничего не выбрано',
    en: 'Nothing selected',
  },
  clipTypeVideo: {
    ru: 'Видео',
    en: 'Video',
  },
  clipTypeAudio: {
    ru: 'Аудио',
    en: 'Audio',
  },
  clipTypeImage: {
    ru: 'Изображение',
    en: 'Image',
  },
  clipTypeText: {
    ru: 'Текст',
    en: 'Text',
  },
  clipTypeSubtitle: {
    ru: 'Субтитр',
    en: 'Subtitle',
  },
  clipTypeShape: {
    ru: 'Фигура',
    en: 'Shape',
  },
  clipGroupHint: {
    ru: 'Удаление применяется ко всем выбранным клипам. Для изменения параметров выберите один клип обычным кликом.',
    en: 'Delete applies to all selected clips. Click a single clip to edit its properties.',
  },
  clipGroup: {
    ru: 'Выбранные клипы',
    en: 'Selected clips',
  },
  sceneProperties: {
    ru: 'Свойства сцены',
    en: 'Scene properties',
  },
  diagnosticsAttached: {
    ru: 'Привязана к исходной записи',
    en: 'Linked to the source recording',
  },
  diagnosticsMissing: {
    ru: 'Для проекта запись не указана',
    en: 'No recording is linked to this project',
  },
  trackPrefix: {
    ru: 'Дорожка:',
    en: 'Track:',
  },
  selectionTitle: {
    ru: 'Выбор',
    en: 'Selection',
  },
  projectDurationSecondsSuffix: {
    ru: 'с',
    en: 's',
  },
  projectFpsSuffix: {
    ru: 'FPS',
    en: 'FPS',
  },
  cursorTrackSeparate: {
    ru: 'Отдельный трек курсора',
    en: 'Separate cursor track',
  },
  cursorTrackEmbedded: {
    ru: 'Курсор встроен в запись',
    en: 'Cursor is embedded in the recording',
  },
  cursorTrackUnavailable: {
    ru: 'Данные курсора для этой записи недоступны',
    en: 'Cursor data is unavailable for this recording',
  },
  actionTrackUnavailable: {
    ru: 'Данные действий для этой записи недоступны',
    en: 'Action data is unavailable for this recording',
  },
  cursorTrackNotAdded: {
    ru: 'Трек не добавлен',
    en: 'Track is not added',
  },
  trackNotSelected: {
    ru: 'Дорожка не выбрана',
    en: 'No track selected',
  },
  selectionEmpty: {
    ru: 'Выберите клип на таймлайне или на сцене, чтобы редактировать параметры.',
    en: 'Select a clip on the timeline or stage to edit its properties.',
  },
  lockedTrackTitle: {
    ru: 'Дорожка заблокирована.',
    en: 'Track is locked.',
  },
  lockedTrackDescription: {
    ru: 'Параметры можно просматривать, но редактирование отключено, пока не снята блокировка.',
    en: 'Properties can be viewed, but editing stays disabled until the lock is removed.',
  },
  linkedPair: {
    ru: 'Связанная пара',
    en: 'Linked pair',
  },
  detachedClip: {
    ru: 'Независимый клип',
    en: 'Independent clip',
  },
  linkedPairDescription: {
    ru: 'Перемещение, обрезка и разрезание применяются вместе. Удаляется только выбранный фрагмент.',
    en: 'Move, trim and split apply together. Delete removes only the selected clip.',
  },
  detachedClipDescription: {
    ru: 'Клип редактируется отдельно от других дорожек.',
    en: 'The clip is edited independently from other tracks.',
  },
  detachButton: {
    ru: 'Расцепить',
    en: 'Detach',
  },
  detachedBadge: {
    ru: 'Отдельно',
    en: 'Standalone',
  },
  widthLabel: {
    ru: 'Ширина',
    en: 'Width',
  },
  heightLabel: {
    ru: 'Высота',
    en: 'Height',
  },
  rotationLabel: {
    ru: 'Поворот',
    en: 'Rotation',
  },
  opacityLabel: {
    ru: 'Непрозрачность',
    en: 'Opacity',
  },
  cameraLayoutLabel: { ru: 'Вид камеры', en: 'Camera layout' },
  cameraLayoutOverlay: { ru: 'В углу', en: 'Overlay' },
  cameraLayoutFullframe: { ru: 'На весь кадр', en: 'Full frame' },
  cameraLayoutHidden: { ru: 'Скрыта', en: 'Hidden' },
  cameraPlacementLabel: { ru: 'Положение камеры', en: 'Camera position' },
  cameraIntervalHint: {
    ru: 'Для выбранного фрагмента камеры. Разделите его у курсора, чтобы изменить вид следующего интервала.',
    en: 'Applies to the selected camera clip. Split at the playhead to change the next interval’s layout.',
  },
  cameraSplitInterval: { ru: 'Разделить у курсора', en: 'Split at playhead' },
  cameraPlacementTopLeft: {
    ru: 'Слева сверху',
    en: 'Top left',
  },
  cameraPlacementTopRight: {
    ru: 'Справа сверху',
    en: 'Top right',
  },
  cameraPlacementBottomLeft: {
    ru: 'Слева снизу',
    en: 'Bottom left',
  },
  cameraPlacementBottomRight: {
    ru: 'Справа снизу',
    en: 'Bottom right',
  },
  fitModeLabel: {
    ru: 'Вписывание',
    en: 'Fit mode',
  },
  fitScalePercentLabel: {
    ru: 'Масштаб, %',
    en: 'Scale, %',
  },
  mediaShadowIntensityLabel: {
    ru: 'Тень',
    en: 'Shadow',
  },
  mediaShadowModeLabel: {
    ru: 'Режим тени',
    en: 'Shadow mode',
  },
  mediaShadowModeBackdrop: {
    ru: 'Подложка',
    en: 'Backdrop',
  },
  mediaShadowModeGlow: {
    ru: 'Свечение',
    en: 'Glow',
  },
  fitApplyToTrackLabel: {
    ru: 'Применить к дорожке',
    en: 'Apply to track',
  },
  trackNameLabel: {
    ru: 'Название дорожки',
    en: 'Track name',
  },
  trackTypeLabel: {
    ru: 'Тип дорожки',
    en: 'Track type',
  },
  trackVisibilityLabel: {
    ru: 'Видимость',
    en: 'Visibility',
  },
  trackLockLabel: {
    ru: 'Блокировка',
    en: 'Lock',
  },
  fitModeContain: {
    ru: 'Вписать',
    en: 'Contain',
  },
  fitModeSource100: {
    ru: '100%',
    en: '100%',
  },
  fitModeLongSide: {
    ru: 'По большей стороне',
    en: 'Fit long side',
  },
  fitModeShortSide: {
    ru: 'По меньшей стороне',
    en: 'Fit short side',
  },
  fitModeCover: {
    ru: 'Заполнить',
    en: 'Cover',
  },
  fitModeStretch: {
    ru: 'Растянуть',
    en: 'Stretch',
  },
  fadeInLabel: {
    ru: 'Плавное появление',
    en: 'Fade in',
  },
  playbackRateLabel: {
    ru: 'Скорость, x',
    en: 'Speed, x',
  },
  fadeOutLabel: {
    ru: 'Плавное исчезание',
    en: 'Fade out',
  },
  transitionInLabel: {
    ru: 'Переход входа',
    en: 'Incoming transition',
  },
  transitionOutLabel: {
    ru: 'Переход выхода',
    en: 'Outgoing transition',
  },
  transitionNone: {
    ru: 'Без перехода',
    en: 'No transition',
  },
  transitionCrossfade: {
    ru: 'Кроссфейд',
    en: 'Crossfade',
  },
  transitionNoticeTitle: {
    ru: 'Переходы активируются только при перекрытии на этой же дорожке.',
    en: 'Transitions only activate when clips overlap on the same track.',
  },
  overlapIncomingPrefix: {
    ru: 'Вход:',
    en: 'In:',
  },
  overlapOutgoingPrefix: {
    ru: 'Выход:',
    en: 'Out:',
  },
  overlapMsSuffix: {
    ru: 'мс перекрытия',
    en: 'ms overlap',
  },
  overlapNone: {
    ru: 'перекрытия нет',
    en: 'no overlap',
  },
  linkedClipsTitlePrefix: {
    ru: 'Связанные клипы:',
    en: 'Linked clips:',
  },
  linkedClipsDescription: {
    ru: 'Перемещаются и обрабатываются вместе. Удаляется только выбранный фрагмент.',
    en: 'Move and process together. Delete removes only the selected clip.',
  },
  videoSoundLabel: {
    ru: 'Звук',
    en: 'Sound',
  },
  linkedAudioLabel: {
    ru: 'Связанное аудио',
    en: 'Linked audio',
  },
  audioClipLabel: {
    ru: 'Аудио-клип',
    en: 'Audio clip',
  },
  volumeLabel: {
    ru: 'Общая громкость',
    en: 'Unified gain',
  },
  volumeEnvelopeStartLabel: {
    ru: 'Громкость в начале',
    en: 'Start gain',
  },
  volumeEnvelopeEndLabel: {
    ru: 'Громкость в конце',
    en: 'End gain',
  },
  ...videoEditorSidebarSelectionStyleMessages,
  ...videoEditorSidebarSelectionAnnotationMessages,
});
