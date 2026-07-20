import { describe, expect, it } from 'vitest';
import { resolveAnnotationScene } from './index';
import { createProjectAndClip, createSceneTemplate, findNode } from './resolver.test-support.ts';
import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  VideoAnnotationTimelineExtrapolate,
  type VideoAnnotationTemplate,
} from './types';

function createNodeValueTemplate() {
  const template = createSceneTemplate();

  return {
    ...template,
    controls: [
      ...template.controls,
      {
        binding: {
          kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
          nodeId: 'headline',
          property: 'text',
        },
        defaultValue: 'Node default',
        id: 'headlineText',
        label: { fallback: 'Node headline' },
        type: VideoAnnotationControlType.TEXT,
      },
    ],
    timeline: {
      ...template.timeline,
      tracks: [
        ...template.timeline.tracks,
        {
          extrapolate: VideoAnnotationTimelineExtrapolate.EXTEND,
          id: 'card-extend-x',
          keyframes: [
            { offsetMs: 100, value: 10 },
            { offsetMs: 200, value: 20 },
          ],
          property: 'x',
          targetNodeId: 'card',
        },
      ],
    },
  } satisfies VideoAnnotationTemplate;
}

describe('annotation scene node values', () => {
  it('keeps layout coordinates separate from timeline transform offsets', () => {
    const { clip, project } = createProjectAndClip();
    clip.templateControlValues = { headlineText: 'Node headline' };

    const scene = resolveAnnotationScene({
      clip,
      currentTime: 0.95,
      project,
      template: createNodeValueTemplate(),
    });

    expect(findNode(scene, 'headline').props['text']).toBe('Node headline');
    expect(findNode(scene, 'card').frame.x).toBe(clip.transform.x + 96);
    expect(findNode(scene, 'card').transform.x).toBe(10);
    expect(findNode(scene, 'headline').style['fill']).toBe('token:text');
  });
});
