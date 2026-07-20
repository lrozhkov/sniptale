import { createEmptyVideoAnnotationTemplateGroups } from '../parser';
import {
  VideoAnnotationElementKind,
  VideoAnnotationTimelineEasing,
  type VideoAnnotationPack,
} from '../types';
import { createBuiltInContentTemplateFactory, createPack, localized } from './helpers';
import {
  arrowCardTree,
  introTree,
  lowerThirdTree,
  magnifierTree,
  pinCalloutTree,
  progressSceneTree,
  spotlightTree,
  titleTree,
} from './apple-glass-trees';
import { arrowTracks, defaultTracks } from './apple-glass-motion';
import { APPLE_GLASS_ANNOTATION_PACK_ID } from './ids';
import { track } from './timeline';

export { APPLE_GLASS_ANNOTATION_PACK_ID } from './ids';

const appleTheme = {
  defaults: {
    accent: '#2f7cf6',
    glassStroke: 'rgba(255,255,255,0.56)',
    mutedText: 'rgba(226,232,240,0.86)',
    panel: 'rgba(15,23,42,0.76)',
    text: '#f8fafc',
  },
  tokens: [
    { id: 'accent', type: 'color', value: '#2f7cf6' },
    { id: 'glassStroke', type: 'color', value: 'rgba(255,255,255,0.56)' },
    { id: 'mutedText', type: 'color', value: 'rgba(226,232,240,0.86)' },
    { id: 'panel', type: 'color', value: 'rgba(15,23,42,0.76)' },
    { id: 'text', type: 'color', value: '#f8fafc' },
  ],
} as const satisfies VideoAnnotationPack['theme'];

const template = createBuiltInContentTemplateFactory({
  catalog: {
    accent: '#2f7cf6',
    background: 'rgba(15,23,42,0.76)',
    defaultDescription: 'Glass annotation.',
    defaultHeadline: 'Название главы',
    defaultSubline: 'Короткий акцент перед продолжением',
    easing: VideoAnnotationTimelineEasing.EASE_OUT,
    headlineColor: '#f8fafc',
    radius: 26,
    sublineColor: 'rgba(226,232,240,0.86)',
  },
  defaultTracks,
  resolveDefaults: (id) => defaults[id],
  resolveElementKind: elementKind,
});

function createAppleTemplates(): VideoAnnotationPack['templates'] {
  const groups = createEmptyVideoAnnotationTemplateGroups();
  groups.intro = [template('glass-chapter-intro', 'intro', introTree(), 2800, 'none')];
  groups.lowerThird = [
    template('glass-identity-lower-third', 'lowerThird', lowerThirdTree(), 2400, 'none'),
  ];
  groups.title = [template('product-title-lockup', 'title', titleTree(), 2200, 'none')];
  groups.callout = [
    template('lens-pin-callout', 'callout', pinCalloutTree(), 2600, 'point'),
    template('crawling-arrow-card', 'callout', arrowCardTree(), 3000, 'point', arrowTracks()),
  ];
  groups.focus = [
    template('soft-spotlight', 'focus', spotlightTree(), 2400, 'rect'),
    template('magnifier-pane', 'focus', magnifierTree(), 2600, 'rect'),
  ];
  groups.scene = [
    template('chapter-progress-scene', 'scene', progressSceneTree(), 3200, 'none', [
      ...defaultTracks(),
      track(
        'progress-draw',
        'progress',
        'progress',
        0,
        1,
        1600,
        VideoAnnotationTimelineEasing.LINEAR
      ),
    ]),
  ];
  return groups;
}

const defaults: Record<
  string,
  { description: string; headline: string; label: string; subline: string }
> = {
  'chapter-progress-scene': {
    description: 'A calm scene transition that marks progress through a walkthrough.',
    headline: 'Прогресс демонстрации',
    label: 'Chapter Progress',
    subline: 'Шаг 2 из 4',
  },
  'crawling-arrow-card': {
    description: 'A target dot, arrow, and glass card for pointing out interface changes.',
    headline: 'Обратите внимание',
    label: 'Guided Arrow Card',
    subline: 'Карточка раскрывается после появления указателя.',
  },
  'glass-chapter-intro': {
    description: 'A cinematic opener for a new section in a product walkthrough.',
    headline: 'Следующий шаг',
    label: 'Glass Chapter Intro',
    subline: 'Короткое вступление перед продолжением демонстрации.',
  },
  'glass-identity-lower-third': {
    description: 'A translucent lower third for naming a section or narrator role.',
    headline: 'Демонстрация продукта',
    label: 'Glass Lower Third',
    subline: 'Обзор функции',
  },
  'lens-pin-callout': {
    description: 'A soft lens pin with a glass detail card for support explainers.',
    headline: 'Важная деталь',
    label: 'Lens Pin Callout',
    subline: 'Контекст вокруг остается видимым.',
  },
  'magnifier-pane': {
    description: 'A material pane that draws attention to a selected region.',
    headline: 'Область внимания',
    label: 'Magnifier Pane',
    subline: 'Покажите участок, который нужно рассмотреть.',
  },
  'product-title-lockup': {
    description: 'A clean title lockup for release highlights and demo chapters.',
    headline: 'Главный акцент',
    label: 'Product Title',
    subline: 'Краткий заголовок для раздела.',
  },
  'soft-spotlight': {
    description: 'A soft focus mask for calm emphasis on an interface region.',
    headline: 'Главное действие',
    label: 'Soft Spotlight',
    subline: 'Направьте внимание, не перекрывая страницу.',
  },
};

export const APPLE_GLASS_ANNOTATION_PACK = createPack({
  description: localized('appleGlassPackDescription', 'Cinematic glass annotations.'),
  label: localized('appleGlassPackLabel', 'Apple Glass'),
  packId: APPLE_GLASS_ANNOTATION_PACK_ID,
  templates: createAppleTemplates(),
  theme: appleTheme,
});

function elementKind(key: string): VideoAnnotationElementKind {
  return key === 'intro'
    ? VideoAnnotationElementKind.INTRO
    : key === 'lowerThird'
      ? VideoAnnotationElementKind.LOWER_THIRD
      : key === 'title'
        ? VideoAnnotationElementKind.TITLE
        : key === 'focus'
          ? VideoAnnotationElementKind.FOCUS
          : key === 'scene'
            ? VideoAnnotationElementKind.SCENE
            : VideoAnnotationElementKind.CALLOUT;
}
