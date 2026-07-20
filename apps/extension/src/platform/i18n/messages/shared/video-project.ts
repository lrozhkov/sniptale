import { defineMessageSource } from '../source';
import { sharedVideoProjectAnnotationDefaultMessages } from './video-project.annotation-defaults.ts';
import { sharedVideoProjectBlockMessages } from './video-project.blocks.ts';

export const sharedVideoProjectMessages = defineMessageSource({
  legacyPrimaryVideo: {
    ru: 'Видео 1',
    en: 'Video 1',
  },
  legacyOverlays: {
    ru: 'Наложения',
    en: 'Overlays',
  },
  legacyTextOverlay: {
    ru: 'Текст',
    en: 'Text',
  },
  legacyEllipseOverlay: {
    ru: 'Эллипс',
    en: 'Ellipse',
  },
  legacyRectangleOverlay: {
    ru: 'Прямоугольник',
    en: 'Rectangle',
  },
  trackVideoPrefix: {
    ru: 'Видео',
    en: 'Video',
  },
  trackAudioPrefix: {
    ru: 'Аудио',
    en: 'Audio',
  },
  trackOverlays: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  trackOverlaysPrefix: {
    ru: 'Аннотации',
    en: 'Annotations',
  },
  trackSubtitles: {
    ru: 'Субтитры',
    en: 'Subtitles',
  },
  trackSubtitlesPrefix: {
    ru: 'Субтитры',
    en: 'Subtitles',
  },
  defaultTextClipName: {
    ru: 'Текст',
    en: 'Text',
  },
  defaultAnnotationClipName: {
    ru: 'Lower third',
    en: 'Lower third',
  },
  defaultAnnotationHeadline: {
    ru: 'Новый lower third',
    en: 'New lower third',
  },
  defaultAnnotationSubline: {
    ru: 'Короткое пояснение для зрителя',
    en: 'Short supporting line for the viewer',
  },
  defaultAnnotationBadge: {
    ru: 'NEW',
    en: 'NEW',
  },
  ...sharedVideoProjectAnnotationDefaultMessages,
  defaultSubtitleClipName: {
    ru: 'Субтитр',
    en: 'Subtitle',
  },
  defaultSubtitleClipContent: {
    ru: 'Новый субтитр',
    en: 'New subtitle',
  },
  defaultTextClipContent: {
    ru: 'Новый текст',
    en: 'New text',
  },
  defaultEllipseClipName: {
    ru: 'Эллипс',
    en: 'Ellipse',
  },
  defaultLineClipName: {
    ru: 'Линия',
    en: 'Line',
  },
  defaultArrowClipName: {
    ru: 'Стрелка',
    en: 'Arrow',
  },
  defaultRectangleClipName: {
    ru: 'Прямоугольник',
    en: 'Rectangle',
  },
  defaultProjectName: {
    ru: 'Новый проект',
    en: 'New project',
  },
  clipLabelAudioFallback: {
    ru: 'Аудио',
    en: 'Audio',
  },
  ...sharedVideoProjectBlockMessages,
});
