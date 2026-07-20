import { defineMessageSource } from '../source';

export const videoEditorStageMessages = defineMessageSource({
  title: {
    ru: 'Превью сцены',
    en: 'Stage preview',
  },
  addRailTitle: {
    ru: 'Добавить в проект',
    en: 'Add to project',
  },
  addRailDescription: {
    ru: 'Сначала выбирайте готовые блоки, ниже доступны шаблоны и остальные элементы сцены.',
    en: 'Start with ready-made blocks, then use templates and other scene items below.',
  },
  addRailMedia: {
    ru: 'Медиа',
    en: 'Media',
  },
  addRailScene: {
    ru: 'Сцена',
    en: 'Scene',
  },
  addRailTemplates: {
    ru: 'Шаблоны',
    en: 'Templates',
  },
  addRailTemplatesEyebrow: {
    ru: 'Ручная сборка',
    en: 'Manual build',
  },
  addRailTemplatesNote: {
    ru: 'Отдельные стили и оверлеи, если нужен более точный ручной контроль.',
    en: 'Individual styles and overlays when you need finer manual control.',
  },
  addRailBlocks: {
    ru: 'Блоки',
    en: 'Blocks',
  },
  addRailBlocksEyebrow: {
    ru: 'Рекомендуемый путь',
    en: 'Recommended path',
  },
  addRailBlocksNote: {
    ru: 'Готовые стартовые блоки с подобранными timing и placement для explain/demo сцен.',
    en: 'Ready-made starter blocks with tuned timing and placement for explain/demo scenes.',
  },
  addRailTracks: {
    ru: 'Дорожки',
    en: 'Tracks',
  },
  addRailAutomation: {
    ru: 'Автоматизация',
    en: 'Automation',
  },
  addZoomRegion: {
    ru: 'Добавить область зума',
    en: 'Add zoom region',
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
  expandAddRail: {
    ru: 'Открыть панель добавления',
    en: 'Open add rail',
  },
  collapseAddRail: {
    ru: 'Свернуть панель добавления',
    en: 'Collapse add rail',
  },
  enterFullscreen: {
    ru: 'Полный экран',
    en: 'Enter fullscreen',
  },
  exitFullscreen: {
    ru: 'Выйти из полного экрана',
    en: 'Exit fullscreen',
  },
  previewMode: {
    ru: 'Режим превью',
    en: 'Preview mode',
  },
  previewModeLive: {
    ru: 'Live',
    en: 'Live',
  },
  previewModeCache: {
    ru: 'Кэш',
    en: 'Cache',
  },
  previewRaster: {
    ru: 'Размер растра превью',
    en: 'Preview raster size',
  },
  previewZoom: {
    ru: 'Масштаб превью',
    en: 'Preview zoom',
  },
  previewZoomFit: {
    ru: 'Вписать',
    en: 'Fit',
  },
  previewPreferencesLoadFailure: {
    ru: 'Не удалось загрузить настройки превью.',
    en: 'Preview settings could not be loaded.',
  },
  previewPreferencesSaveFailure: {
    ru: 'Не удалось сохранить настройки превью.',
    en: 'Preview settings could not be saved.',
  },
  previewPreferencesRetry: {
    ru: 'Повторить сохранение',
    en: 'Retry saving',
  },
  previewCacheRetentionDisclosure: {
    ru: 'Кэш хранит локальные производные видео до 14 дней (не более 12 записей и 512 МиБ). Он удаляется вместе с проектом или при удалении локальных данных.',
    en: 'Cache stores local derived video for up to 14 days (maximum 12 records and 512 MiB). It is removed with the project or when local data is deleted.',
  },
  previewCachePreparing: {
    ru: 'Подготовка кэша',
    en: 'Preparing cache',
  },
  previewCachePaused: {
    ru: 'Подготовка приостановлена',
    en: 'Preparation paused',
  },
  previewCacheReady: {
    ru: 'Кэш готов',
    en: 'Cache ready',
  },
  previewCacheCapacityLimited: {
    ru: 'Недостаточно места для полного кэша',
    en: 'Not enough capacity for the complete cache',
  },
  previewCacheUnavailable: {
    ru: 'Кэш недоступен — используется Live',
    en: 'Cache unavailable — using Live',
  },
  previewCacheFailed: {
    ru: 'Не удалось подготовить кэш — используется Live',
    en: 'Cache preparation failed — using Live',
  },
  fullscreenPlayer: {
    ru: 'Полноэкранное превью',
    en: 'Fullscreen preview',
  },
  fullscreenSeek: {
    ru: 'Позиция полноэкранного превью',
    en: 'Fullscreen preview position',
  },
  moveAnnotationTarget: {
    ru: 'Переместить таргет аннотации',
    en: 'Move annotation target',
  },
  moveAnnotationTargetArea: {
    ru: 'Переместить область таргета аннотации',
    en: 'Move annotation target area',
  },
  noSelection: {
    ru: 'Без выделения',
    en: 'No selection',
  },
  empty: {
    ru: 'На текущем времени нет активных визуальных клипов.',
    en: 'There are no active visual clips at the current time.',
  },
  effectRuntimeFailure: {
    ru: 'Не удалось отрисовать эффекты. Остальная сцена сохранена.',
    en: 'Effects could not be rendered. The rest of the scene is preserved.',
  },
  effectRuntimeRetry: {
    ru: 'Повторить',
    en: 'Retry',
  },
  addText: {
    ru: 'Добавить текст',
    en: 'Add text',
  },
  addSubtitle: {
    ru: 'Добавить субтитр',
    en: 'Add subtitle',
  },
  addImageNote: {
    ru: 'PNG, JPG, WebP',
    en: 'PNG, JPG, WebP',
  },
  addVideoNote: {
    ru: 'MP4, WebM, MOV',
    en: 'MP4, WebM, MOV',
  },
  addAudioNote: {
    ru: 'MP3, WAV, AAC',
    en: 'MP3, WAV, AAC',
  },
  addTextNote: {
    ru: 'Заголовок или выноска',
    en: 'Title or callout',
  },
  addRectangle: {
    ru: 'Добавить прямоугольник',
    en: 'Add rectangle',
  },
  addLine: {
    ru: 'Добавить линию',
    en: 'Add line',
  },
  addArrow: {
    ru: 'Добавить стрелку',
    en: 'Add arrow',
  },
  addRectangleNote: {
    ru: 'Простая плашка для фона',
    en: 'Simple backdrop block',
  },
  addEllipse: {
    ru: 'Добавить эллипс',
    en: 'Add ellipse',
  },
  addVideoTrackNote: {
    ru: 'Для дополнительных визуальных слоёв',
    en: 'For extra visual layers',
  },
  addAudioTrackNote: {
    ru: 'Музыка и голосовые слои',
    en: 'Music and voice layers',
  },
  addOverlayTrackNote: {
    ru: 'Текст, фигуры и оверлеи',
    en: 'Text, shapes, and overlays',
  },
  addCursorTrackNote: {
    ru: 'Замена курсора и траектория',
    en: 'Cursor replacement and motion',
  },
  addActionNote: {
    ru: 'Клики и акцентные события',
    en: 'Click and focus emphasis',
  },
  addZoomRegionNote: {
    ru: 'Зум и поведение камеры',
    en: 'Zoom and camera follow',
  },
});
