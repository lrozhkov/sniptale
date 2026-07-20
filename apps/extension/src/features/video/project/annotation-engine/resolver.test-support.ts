import { expect } from 'vitest';
import { createAnnotationClip } from '../annotation/template';
import { createEmptyVideoProject } from '../factories/creation';
import type { VideoProject, VideoProjectAnnotationClip } from '../types/index';
import { resolveAnnotationScene, type ResolvedAnnotationScene } from './index';
import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlType,
  VideoAnnotationElementKind,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
  type VideoAnnotationTemplate,
} from './types';
import { createSceneTimeline } from './resolver.timeline.test-support.ts';

export function createProjectAndClip() {
  const project = createEmptyVideoProject('Annotation scene', 1280, 720);
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 1);
  clip.duration = 3;
  clip.introDurationMs = 500;
  clip.outroDurationMs = 500;
  clip.targetPoint = { x: 320, y: 180 };
  clip.targetRect = { height: 80, width: 160, x: 400, y: 240 };
  clip.templateControlValues = {
    accent: '#111827',
    headline: 'Resolved headline',
  };
  return { clip, project };
}

export function createSceneTemplate(
  targetKind: VideoAnnotationTargetBindingKind = VideoAnnotationTargetBindingKind.POINT
) {
  return {
    controls: createSceneControls(),
    description: { fallback: 'Resolver scenario' },
    elementKind: VideoAnnotationElementKind.CALLOUT,
    id: 'resolver-scenario',
    label: { fallback: 'Resolver scenario' },
    renderTree: createSceneRenderTree(),
    target: { kind: targetKind, required: targetKind !== VideoAnnotationTargetBindingKind.NONE },
    timeline: createSceneTimeline(),
  } satisfies VideoAnnotationTemplate;
}

function createSceneControls(): VideoAnnotationTemplate['controls'] {
  return [
    {
      binding: {
        field: 'content.headline',
        kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
      },
      defaultValue: 'Default headline',
      id: 'headline',
      label: { fallback: 'Headline' },
      type: VideoAnnotationControlType.TEXT,
    },
    {
      binding: {
        kind: VideoAnnotationControlBindingKind.THEME_TOKEN,
        tokenId: 'accent',
      },
      defaultValue: '#2563eb',
      id: 'accent',
      label: { fallback: 'Accent' },
      type: VideoAnnotationControlType.COLOR,
    },
  ];
}

function createSceneRenderTree(): VideoAnnotationTemplate['renderTree'] {
  return {
    children: [createDotNode(), createLeaderNode(), createCardNode()],
    id: 'root',
    nodeType: VideoAnnotationRenderNodeKind.GROUP,
  };
}

function createDotNode() {
  return {
    frame: { height: 12, width: 12, x: 0, y: 0 },
    id: 'dot',
    nodeType: VideoAnnotationRenderNodeKind.MARKER,
    style: { fill: 'token:accent' },
  };
}

function createLeaderNode() {
  return {
    frame: { height: 1, width: '100%-24', x: 12, y: 6 },
    id: 'leader',
    nodeType: VideoAnnotationRenderNodeKind.PATH,
    props: { progress: 0 },
    style: { stroke: 'token:accent', strokeWidth: 2 },
  };
}

function createCardNode() {
  return {
    children: [
      {
        frame: { height: 28, width: '100%-32', x: 16, y: 16 },
        id: 'headline',
        nodeType: VideoAnnotationRenderNodeKind.TEXT,
        props: { text: 'field:headline' },
        style: { fill: 'token:text' },
      },
    ],
    frame: { height: 72, width: 240, x: 96, y: 24 },
    id: 'card',
    nodeType: VideoAnnotationRenderNodeKind.GROUP,
    style: { fill: 'token:panel' },
  };
}

export function resolveTestScene(
  project: VideoProject,
  clip: VideoProjectAnnotationClip,
  currentTime: number,
  template = createSceneTemplate()
) {
  return resolveAnnotationScene({
    clip,
    currentTime,
    project,
    template,
    theme: {
      defaults: { panel: '#ffffff', text: '#111111' },
      tokens: [
        { id: 'accent', type: 'color', value: '#2563eb' },
        { id: 'panel', type: 'color', value: '#ffffff' },
        { id: 'text', type: 'color', value: '#111111' },
      ],
    },
  });
}

export function findNode(scene: ResolvedAnnotationScene, id: string) {
  const node = scene.nodes.find((candidate) => candidate.id === id);
  expect(node).toBeDefined();
  return node!;
}

export function findEffect(scene: ResolvedAnnotationScene, id: string) {
  const effect = scene.timeline.effects.find((candidate) => candidate.id === id);
  expect(effect).toBeDefined();
  return effect!;
}
