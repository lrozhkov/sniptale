import { createEmptyVideoAnnotationTemplateGroups } from '../parser';
import {
  VideoAnnotationElementKind,
  VideoAnnotationTimelineEasing,
  type VideoAnnotationPack,
} from '../types';
import { createBuiltInContentTemplateFactory, createPack, localized } from './helpers';
import {
  bootTree,
  codeTitleTree,
  diagnosticTree,
  lowerThirdTree,
  symbolPointerTree,
  timelineSceneTree,
} from './cursor-ops-trees';
import { diffSpotlightTree, scanFrameTree } from './cursor-ops-focus-trees';
import { defaultTracks } from './cursor-ops-motion';
import { CURSOR_OPS_ANNOTATION_PACK_ID } from './ids';
import { track } from './timeline';

export { CURSOR_OPS_ANNOTATION_PACK_ID } from './ids';

const cursorTheme = {
  defaults: {
    accent: '#f97316',
    changeAdd: '#10b981',
    changeRemove: '#fb7185',
    mutedText: '#807568',
    panel: '#fff7ed',
    text: '#171412',
  },
  tokens: [
    { id: 'accent', type: 'color', value: '#f97316' },
    { id: 'changeAdd', type: 'color', value: '#10b981' },
    { id: 'changeRemove', type: 'color', value: '#fb7185' },
    { id: 'mutedText', type: 'color', value: '#807568' },
    { id: 'panel', type: 'color', value: '#fff7ed' },
    { id: 'text', type: 'color', value: '#171412' },
  ],
} as const satisfies VideoAnnotationPack['theme'];

const template = createBuiltInContentTemplateFactory({
  catalog: {
    accent: '#f97316',
    background: '#fff7ed',
    defaultDescription: 'Cursor Ops annotation.',
    defaultHeadline: 'Запуск шага',
    defaultSubline: 'Состояние готово',
    easing: VideoAnnotationTimelineEasing.LINEAR,
    headlineColor: '#171412',
    radius: 8,
    sublineColor: '#807568',
  },
  defaultTracks,
  resolveDefaults: (id) => defaults[id],
  resolveElementKind: elementKind,
});

function createCursorTemplates(): VideoAnnotationPack['templates'] {
  const groups = createEmptyVideoAnnotationTemplateGroups();
  groups.intro = [template('workflow-boot-intro', 'intro', bootTree(), 2600, 'none')];
  groups.lowerThird = [
    template('command-status-lower-third', 'lowerThird', lowerThirdTree(), 2200, 'none'),
  ];
  groups.title = [template('code-reveal-title', 'title', codeTitleTree(), 2400, 'none')];
  groups.callout = [
    template('diagnostic-stack-callout', 'callout', diagnosticTree(), 2600, 'rect'),
    template('inline-symbol-pointer', 'callout', symbolPointerTree(), 1800, 'point'),
  ];
  groups.focus = [
    template(
      'scan-selection-frame',
      'focus',
      scanFrameTree(),
      2300,
      'rect',
      defaultTracks().filter((candidate) => candidate.targetNodeId !== 'subline')
    ),
    template('diff-spotlight', 'focus', diffSpotlightTree(), 2600, 'rect'),
  ];
  groups.scene = [
    template('operation-timeline-scene', 'scene', timelineSceneTree(), 3200, 'none', [
      ...defaultTracks(),
      track(
        'progress-draw',
        'progress',
        'progress',
        0,
        1,
        1400,
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
  'code-reveal-title': {
    description: 'A precise title reveal for step-by-step UI tutorials.',
    headline: 'Пошаговый разбор',
    label: 'Step Reveal Title',
    subline: 'Следуйте выделенному действию.',
  },
  'command-status-lower-third': {
    description: 'A compact status strip for tutorial stages and support explainers.',
    headline: 'Действие выполнено',
    label: 'Status Lower Third',
    subline: 'Можно переходить к следующему шагу',
  },
  'diagnostic-stack-callout': {
    description: 'Layered callout cards for explaining multiple visible states.',
    headline: 'Два обновления применены',
    label: 'Stacked State Callout',
    subline: 'Выбранная область теперь соответствует инструкции.',
  },
  'diff-spotlight': {
    description: 'A change-focused highlight using warm operational colors.',
    headline: 'До и после',
    label: 'Change Spotlight',
    subline: 'Покажите, что изменилось в интерфейсе.',
  },
  'inline-symbol-pointer': {
    description: 'A compact pointer for precise controls and small interface targets.',
    headline: 'Выбранный контрол',
    label: 'Inline Pointer',
    subline: 'Нажмите здесь, чтобы продолжить.',
  },
  'operation-timeline-scene': {
    description: 'A workflow progress scene with crisp status rhythm.',
    headline: 'От записи к экспорту',
    label: 'Workflow Timeline',
    subline: 'Три шага в этой демонстрации.',
  },
  'scan-selection-frame': {
    description: 'A sharp scan frame for selections and active interface regions.',
    headline: 'Область выбрана',
    label: 'Scan Selection Frame',
    subline: 'Эта область в фокусе.',
  },
  'workflow-boot-intro': {
    description: 'A structured opener for tutorials, release notes, and training videos.',
    headline: 'Демонстрация начинается',
    label: 'Workflow Intro',
    subline: 'Сейчас начнутся ключевые шаги.',
  },
};

export const CURSOR_OPS_ANNOTATION_PACK = createPack({
  description: localized('cursorOpsPackDescription', 'Command-driven developer annotations.'),
  label: localized('cursorOpsPackLabel', 'Cursor Ops'),
  packId: CURSOR_OPS_ANNOTATION_PACK_ID,
  templates: createCursorTemplates(),
  theme: cursorTheme,
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
