import { defineMessageSource } from '../source';

export const galleryVideoReviewTimelineMessages = defineMessageSource({
  noTrackSelected: { ru: 'Дорожка не выбрана', en: 'No track selected' },
  noTrackActions: {
    ru: 'Для этой дорожки нет доступных действий',
    en: 'No actions available for this track',
  },
  trackActionsHint: {
    ru: 'Используйте кнопки дорожки или перетаскивайте её элементы',
    en: 'Use the track controls or drag its items',
  },
  intervalBounds: { ru: 'Границы интервала', en: 'Interval bounds' },
  resizeDuration: { ru: 'Длительность {duration}', en: 'Duration {duration}' },
  resizeBefore: { ru: 'Было {duration}', en: 'Was {duration}' },
  resizeSeconds: { ru: '{value} с', en: '{value} s' },
  resizeTimeline: { ru: 'Изменить высоту таймлайна', en: 'Resize timeline' },
  timelineStart: { ru: 'В начало (Home)', en: 'Go to start (Home)' },
  timelineEnd: { ru: 'В конец (End)', en: 'Go to end (End)' },
  resizeStart: { ru: 'Изменить начало участка', en: 'Resize interval start' },
  resizeEnd: { ru: 'Изменить конец участка', en: 'Resize interval end' },
  timelineZoom: { ru: 'Масштаб таймлайна', en: 'Timeline zoom' },
});
