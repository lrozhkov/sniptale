import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControl,
  type VideoAnnotationTimelineTrack,
} from './types';
import type { createSceneTemplate } from './resolver.test-support.ts';

export function createDeclarativeTemplate(
  template: ReturnType<typeof createSceneTemplate>
): VideoAnnotationTemplate {
  return {
    ...template,
    controls: [
      ...template.controls,
      createFieldControl('badge', 'content.badge', 'Badge'),
      createFieldControl('subline', 'content.subline', 'Subline'),
      createFieldControl('background', 'style.backgroundColor', '#101010'),
      createFieldControl('badgeText', 'style.badgeTextColor', '#ffffff'),
      createFieldControl('headlineColor', 'style.headlineColor', '#ffffff'),
      createFieldControl('sublineColor', 'style.sublineColor', '#dddddd'),
      createFieldControl('radius', 'style.borderRadius', 12),
      createFieldControl('padding', 'style.padding', 18),
      createCardFillControl(),
    ],
    timeline: {
      ...template.timeline,
      tracks: [...template.timeline.tracks, ...createDeclarativeTracks()],
    },
  };
}

function createCardFillControl(): VideoAnnotationTemplateControl {
  return {
    binding: {
      kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
      nodeId: 'card',
      property: 'fill',
    },
    defaultValue: '#ffffff',
    id: 'cardFill',
    label: { fallback: 'Card fill' },
    type: VideoAnnotationControlType.COLOR,
  };
}

function createDeclarativeTracks(): VideoAnnotationTimelineTrack[] {
  return [
    createTrack('card-rotation', 'card', 'rotation', 0, 8),
    createTrack('card-blur', 'card', 'blurPx', 0, 6),
    createTrack('dot-fill', 'dot', 'fill', '#ffffff', '#000000'),
    createTrack('headline-meta', 'headline', 'customData', 'a', 'b'),
  ];
}

function createFieldControl(
  id: string,
  field: Extract<
    VideoAnnotationTemplateControl['binding'],
    { kind: typeof VideoAnnotationControlBindingKind.TEMPLATE_FIELD }
  >['field'],
  defaultValue: number | string
): VideoAnnotationTemplateControl {
  return {
    binding: {
      field,
      kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
    },
    defaultValue,
    id,
    label: { fallback: id },
    type:
      typeof defaultValue === 'number'
        ? VideoAnnotationControlType.NUMBER
        : VideoAnnotationControlType.TEXT,
  };
}

function createTrack(
  id: string,
  targetNodeId: string,
  property: VideoAnnotationTimelineTrack['property'],
  firstValue: number | string,
  secondValue: number | string
): VideoAnnotationTimelineTrack {
  return {
    id,
    keyframes: [
      { offsetMs: 0, value: firstValue },
      { offsetMs: 300, value: secondValue },
    ],
    property,
    targetNodeId,
  };
}
