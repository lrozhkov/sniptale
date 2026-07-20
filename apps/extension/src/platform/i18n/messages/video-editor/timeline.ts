import { defineMessageSource } from '../source';
import { videoEditorTimelineAutoTransformMessages } from './timeline-auto-transform';
import { videoEditorTimelineLaneMessages } from './timeline-lanes';

export const videoEditorTimelineMessages = defineMessageSource({
  trackKindPrimary: {
    ru: 'Видео',
    en: 'Video',
  },
  trackKindAudio: {
    ru: 'Аудио',
    en: 'Audio',
  },
  trackKindOverlay: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  trackKindSubtitle: {
    ru: 'Субтитры',
    en: 'Subtitles',
  },
  play: {
    ru: 'Воспроизвести',
    en: 'Play',
  },
  pause: {
    ru: 'Пауза',
    en: 'Pause',
  },
  seekToStart: {
    ru: 'В начало',
    en: 'Go to start',
  },
  title: {
    ru: 'Таймлайн',
    en: 'Timeline',
  },
  tracksMetaSuffix: {
    ru: 'дорожек',
    en: 'tracks',
  },
  clipsMetaSuffix: {
    ru: 'клипов',
    en: 'clips',
  },
  split: {
    ru: 'Разрезать',
    en: 'Split',
  },
  duplicate: {
    ru: 'Копия',
    en: 'Duplicate',
  },
  delete: {
    ru: 'Удалить',
    en: 'Delete',
  },
  addTrack: {
    ru: 'Добавить дорожку',
    en: 'Add track',
  },
  addTrackMenuTitle: {
    ru: 'Тип дорожки',
    en: 'Track type',
  },
  addVideoTrack: {
    ru: 'Видео-дорожка',
    en: 'Video track',
  },
  addAudioTrack: {
    ru: 'Аудио-дорожка',
    en: 'Audio track',
  },
  addOverlayTrack: {
    ru: 'Дорожка аннотаций',
    en: 'Annotation track',
  },
  addSubtitleTrack: {
    ru: 'Дорожка субтитров',
    en: 'Subtitle track',
  },
  addZoomRegion: {
    ru: 'Область зума',
    en: 'Zoom region',
  },
  closeGap: {
    ru: 'Схлопнуть промежуток',
    en: 'Close gap',
  },
  secondsSuffix: {
    ru: 'с',
    en: 's',
  },
  selectionRequiredTitle: {
    ru: 'Действия с клипом недоступны',
    en: 'Clip actions are unavailable',
  },
  selectionRequiredDescription: {
    ru: 'Выберите клип на таймлайне, чтобы разрезать, дублировать или удалить его.',
    en: 'Select a clip on the timeline to split, duplicate, or delete it.',
  },
  zoom: {
    ru: 'Масштаб таймлайна',
    en: 'Timeline zoom',
  },
  fitProject: {
    ru: 'Вместить проект',
    en: 'Fit project',
  },
  fitSelection: {
    ru: 'Вместить выделение',
    en: 'Fit selection',
  },
  tracksTitle: {
    ru: 'Дорожки',
    en: 'Tracks',
  },
  moveTrackUp: {
    ru: 'Поднять дорожку',
    en: 'Move track up',
  },
  moveTrackDown: {
    ru: 'Опустить дорожку',
    en: 'Move track down',
  },
  deleteTrackTitle: {
    ru: 'Удалить дорожку',
    en: 'Delete track',
  },
  deleteTrackConfirm: {
    ru: 'Дорожка будет удалена из проекта.',
    en: 'This track will be removed from the project.',
  },
  deleteTrackWithClipsConfirm: {
    ru: 'Дорожка и все её клипы будут удалены из проекта.',
    en: 'This track and all of its clips will be removed from the project.',
  },
  trackAlreadyFirstReason: {
    ru: 'Дорожка уже сверху',
    en: 'This track is already at the top',
  },
  trackAlreadyLastReason: {
    ru: 'Дорожка уже снизу',
    en: 'This track is already at the bottom',
  },
  trackPanelToggle: {
    ru: 'Панель дорожек',
    en: 'Track panel',
  },
  trackPanelCollapsedVisible: {
    ru: 'В свернутом виде',
    en: 'Collapsed',
  },
  hideInCollapsedPanel: {
    ru: 'Скрывать',
    en: 'Hide',
  },
  showInCollapsedPanel: {
    ru: 'Показывать',
    en: 'Show',
  },
  trackRename: {
    ru: 'Переименовать дорожку',
    en: 'Rename track',
  },
  trackHeight: {
    ru: 'Высота дорожки',
    en: 'Track height',
  },
  trackVisible: {
    ru: 'видна',
    en: 'visible',
  },
  trackHidden: {
    ru: 'скрыта',
    en: 'hidden',
  },
  trackLocked: {
    ru: 'заблокирована',
    en: 'locked',
  },
  trackEditable: {
    ru: 'редактируется',
    en: 'editable',
  },
  crossfadeIncomingPrefix: {
    ru: 'Входящий кроссфейд',
    en: 'Incoming crossfade',
  },
  crossfadeOutgoingPrefix: {
    ru: 'Исходящий кроссфейд',
    en: 'Outgoing crossfade',
  },
  crossfadeMsSuffix: {
    ru: 'мс',
    en: 'ms',
  },
  derivedLaneLabel: {
    ru: '',
    en: '',
  },
  visibleRangePrefix: {
    ru: 'На экране:',
    en: 'Visible:',
  },
  clearRange: {
    ru: 'Сбросить фрагмент',
    en: 'Clear range',
  },
  speedLabel: {
    ru: 'Скорость',
    en: 'Speed',
  },
  ...videoEditorTimelineAutoTransformMessages,
  addButton: {
    ru: 'Добавить',
    en: 'Add',
  },
  addMenuTitle: {
    ru: 'Добавить на таймлайн',
    en: 'Add to timeline',
  },
  addMenuDescription: {
    ru: 'В позицию бегунка. Если место занято, объект будет добавлен в конец дорожки.',
    en: 'Insert at the playhead. If the slot is occupied, the item is added at the end of the track.',
  },
  loopRangePrefix: {
    ru: 'Повтор фрагмента:',
    en: 'Loop range:',
  },
  ...videoEditorTimelineLaneMessages,
  emptyLaneLabel: {
    ru: 'Сегменты появятся здесь, когда в проекте появятся данные.',
    en: 'Segments will appear here when the project contains data.',
  },
  fileDropUnsupported: {
    ru: 'Этот файл нельзя добавить на таймлайн.',
    en: 'This file cannot be added to the timeline.',
  },
});
