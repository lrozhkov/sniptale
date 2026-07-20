import { expect, it, vi } from 'vitest';
import {
  createProjectAndClip,
  createSceneTemplate,
  resolveTestScene,
} from '../../../project/annotation-engine/resolver.test-support.ts';
import {
  resolveAnnotationScene,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
  type VideoAnnotationTemplate,
} from '../../../project/annotation-engine';
import { drawAnnotationCompositionLayer } from './index';
import { drawResolvedAnnotationScene } from './scene';

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    filter: 'none',
    globalAlpha: 1,
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('maps target scene nodes against the annotation body viewport for export parity', () => {
  const { clip, project } = createProjectAndClip();
  const template = createSceneTemplate(VideoAnnotationTargetBindingKind.RECT);
  const scene = resolveScene(project, clip, 1.8, createTargetFrameTemplate(template));
  const targetRect = clip.targetRect;
  if (!targetRect) {
    throw new Error('Expected fixture target rect.');
  }
  const context = createContext();

  drawResolvedAnnotationScene({
    clipViewport: false,
    context,
    displayScale: 1,
    scene,
    sourceFrame: scene.presentation.labelFrame,
    viewport: {
      height: scene.presentation.labelFrame.height,
      width: scene.presentation.labelFrame.width,
      x: 0,
      y: 0,
    },
  });

  expect(context.moveTo).toHaveBeenCalledWith(
    targetRect.x - scene.presentation.labelFrame.x + 12,
    targetRect.y - scene.presentation.labelFrame.y
  );
});

it('draws target-bound scene composition layers without clipping to the body viewport', () => {
  const { clip, project } = createProjectAndClip();
  const scene = resolveTestScene(
    project,
    clip,
    1.8,
    createSceneTemplate(VideoAnnotationTargetBindingKind.RECT)
  );
  const context = createContext();

  drawAnnotationCompositionLayer(
    context,
    createSceneClip(scene, clip),
    scene.presentation.labelFrame.x,
    scene.presentation.labelFrame.y,
    scene.presentation.labelFrame.width,
    scene.presentation.labelFrame.height
  );

  expect(context.rect).not.toHaveBeenCalledWith(
    scene.presentation.labelFrame.x,
    scene.presentation.labelFrame.y,
    scene.presentation.labelFrame.width,
    scene.presentation.labelFrame.height
  );
  expect(context.fillText).toHaveBeenCalled();
});

it('keeps non-target scene composition layers clipped to their scene viewport', () => {
  const { clip, project } = createProjectAndClip();
  const scene = resolveTestScene(
    project,
    clip,
    1.8,
    createSceneTemplate(VideoAnnotationTargetBindingKind.NONE)
  );
  const context = createContext();

  drawAnnotationCompositionLayer(
    context,
    createSceneClip(scene, clip),
    scene.presentation.labelFrame.x,
    scene.presentation.labelFrame.y,
    scene.presentation.labelFrame.width,
    scene.presentation.labelFrame.height
  );

  expect(context.rect).toHaveBeenCalledWith(
    scene.presentation.labelFrame.x,
    scene.presentation.labelFrame.y,
    scene.presentation.labelFrame.width,
    scene.presentation.labelFrame.height
  );
  expect(context.clip).toHaveBeenCalled();
});

function createTargetFrameTemplate(template: VideoAnnotationTemplate): VideoAnnotationTemplate {
  return {
    ...template,
    renderTree: {
      children: [
        {
          id: 'target-frame',
          nodeType: VideoAnnotationRenderNodeKind.FRAME,
          props: { target: 'rect' },
          style: { stroke: '#2563eb', strokeWidth: 2 },
        },
      ],
      id: 'root',
      nodeType: VideoAnnotationRenderNodeKind.GROUP,
    },
  };
}

function resolveScene(
  project: Parameters<typeof resolveTestScene>[0],
  clip: Parameters<typeof resolveTestScene>[1],
  currentTime: number,
  template: VideoAnnotationTemplate
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

function createSceneClip(
  scene: ReturnType<typeof resolveTestScene>,
  clip: ReturnType<typeof createProjectAndClip>['clip']
) {
  return {
    calloutDecor: clip.calloutDecor,
    content: clip.content,
    id: clip.id,
    leaderLine: clip.leaderLine,
    presentation: scene.presentation,
    renderFamily: clip.renderFamily,
    scene,
    target: clip.target,
    targetPoint: clip.targetPoint,
    targetRect: clip.targetRect,
    templateKind: clip.templateKind,
    trackId: clip.trackId,
  } as const;
}
