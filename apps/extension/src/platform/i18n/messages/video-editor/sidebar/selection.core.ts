import { defineMessageSource } from '../../source';
import { videoEditorSidebarSelectionAnnotationMessages } from './selection.annotation.ts';
import { videoEditorSidebarSelectionStyleMessages } from './selection.core-style.ts';

export const videoEditorSidebarSelectionCoreMessages = defineMessageSource({
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
    ru: 'Обрезка, разрезание и удаление применяются к связанным клипам вместе.',
    en: 'Trim, split, and delete apply to linked clips together.',
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
    ru: 'Плавное появление, мс',
    en: 'Fade in, ms',
  },
  playbackRateLabel: {
    ru: 'Скорость, x',
    en: 'Speed, x',
  },
  fadeOutLabel: {
    ru: 'Плавное исчезание, мс',
    en: 'Fade out, ms',
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
    ru: 'Плавные появления, переходы и монтажные операции синхронизируются между видео и аудио до явного разъединения.',
    en: 'Fade, transition, and editing operations stay synchronized between video and audio until an explicit detach.',
  },
  videoSoundLabel: {
    ru: 'Звук видео',
    en: 'Video sound',
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
