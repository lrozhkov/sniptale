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
  type VideoAnnotationRenderNode,
  type VideoAnnotationTemplate,
} from '../../../project/annotation-engine';
import { drawResolvedAnnotationScene } from './scene';

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
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

it('draws path progress, arrow marker, text, card mask, and progress primitives from one scene', () => {
  const { clip, project } = createProjectAndClip();
  const template = createSceneTemplate();
  const scene = resolveScene(project, clip, 1.75, {
    ...template,
    renderTree: createProgressRenderTree(template),
  });
  const context = createContext();

  drawResolvedAnnotationScene({
    context,
    displayScale: 1,
    scene,
    viewport: { height: scene.frame.height, width: scene.frame.width, x: 0, y: 0 },
  });

  expect(context.rect).toHaveBeenCalledWith(
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
  expect(context.lineTo).toHaveBeenCalled();
  expect(context.closePath).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalledWith(
    'Resolved headline',
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
  expect(context.fillRect).toHaveBeenCalled();
});

function createProgressRenderTree(template: VideoAnnotationTemplate) {
  return {
    ...template.renderTree,
    children: (template.renderTree.children ?? []).map((node) =>
      node.id === 'leader'
        ? { ...node, props: { ...node.props, arrowEnd: true } }
        : appendProgressNode(node)
    ) as readonly VideoAnnotationRenderNode[],
  };
}

function appendProgressNode(node: VideoAnnotationRenderNode): VideoAnnotationRenderNode {
  if (node.id !== 'card') {
    return node;
  }

  return {
    ...node,
    children: [
      ...(node.children ?? []),
      {
        frame: { height: 4, width: '100%-32', x: 16, y: '100%-12' },
        id: 'progress',
        nodeType: VideoAnnotationRenderNodeKind.PROGRESS,
        props: { progress: 0.5 },
        style: { fill: '#2563eb' },
      },
    ],
  };
}

it('draws target-bound frame, spotlight, and ring marker primitives without template switches', () => {
  const { clip, project } = createProjectAndClip();
  const template = createSceneTemplate(VideoAnnotationTargetBindingKind.RECT);
  const targetRect = getTargetRect(clip);
  const scene = resolveScene(project, clip, 1.8, {
    ...template,
    renderTree: createTargetPrimitiveRenderTree(),
  });
  const context = createContext();

  drawResolvedAnnotationScene({
    context,
    displayScale: 1,
    scene,
    viewport: { height: scene.frame.height, width: scene.frame.width, x: 0, y: 0 },
  });

  expect(context.arc).toHaveBeenCalledTimes(2);
  expect(context.stroke).toHaveBeenCalled();
  expect(context.moveTo).toHaveBeenCalledWith(
    targetRect.x - scene.frame.x,
    targetRect.y - scene.frame.y
  );
});

function getTargetRect(clip: ReturnType<typeof createProjectAndClip>['clip']) {
  if (!clip.targetRect) {
    throw new Error('Expected fixture target rect.');
  }
  return clip.targetRect;
}

function createTargetPrimitiveRenderTree(): VideoAnnotationTemplate['renderTree'] {
  return {
    children: [
      {
        frame: { height: 20, width: 20 },
        id: 'target-ring',
        nodeType: VideoAnnotationRenderNodeKind.MARKER,
        props: { target: 'point', variant: 'ring' },
        style: { stroke: '#2563eb', strokeWidth: 3 },
      },
      {
        id: 'target-frame',
        nodeType: VideoAnnotationRenderNodeKind.FRAME,
        props: { target: 'rect', variant: 'bracket' },
        style: { stroke: '#2563eb', strokeWidth: 2 },
      },
      {
        id: 'target-spotlight',
        nodeType: VideoAnnotationRenderNodeKind.SPOTLIGHT,
        props: { target: 'rect' },
        style: { fill: 'rgba(37,99,235,0.18)', stroke: '#2563eb' },
      },
    ],
    id: 'root',
    nodeType: VideoAnnotationRenderNodeKind.GROUP,
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
      defaults: { accent: '#2563eb', panel: '#ffffff', text: '#111111' },
      tokens: [
        { id: 'accent', type: 'color', value: '#2563eb' },
        { id: 'panel', type: 'color', value: '#ffffff' },
        { id: 'text', type: 'color', value: '#111111' },
      ],
    },
  });
}

it('applies presentation effects before drawing scene nodes for export parity', () => {
  const { clip, project } = createProjectAndClip();
  const scene = resolveTestScene(project, clip, 1.75);
  const context = createContext();

  drawResolvedAnnotationScene({
    context,
    displayScale: 2,
    scene: {
      ...scene,
      effects: {
        ...scene.effects,
        blurPx: 3,
        scaleMultiplier: 1.08,
        translateX: 12,
        translateY: -6,
      },
    },
    viewport: { height: scene.frame.height, width: scene.frame.width, x: 20, y: 30 },
  });

  expect(context.filter).toBe('blur(6.00px)');
  expect(context.translate).toHaveBeenCalledWith(
    20 + scene.frame.width / 2 + 24,
    30 + scene.frame.height / 2 - 12
  );
  expect(context.scale).toHaveBeenCalledWith(1.08, 1.08);
});

it('covers text alignment and shape branches for native scene primitives', () => {
  const { clip, project } = createProjectAndClip();
  const template = createSceneTemplate();
  const scene = resolveScene(project, clip, 1.75, {
    ...template,
    renderTree: createNativePrimitiveRenderTree(),
  });
  const context = createContext();

  drawResolvedAnnotationScene({
    context,
    displayScale: 1,
    scene,
    viewport: { height: scene.frame.height, width: scene.frame.width, x: 0, y: 0 },
  });

  expect(context.fillText).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
  expect(context.stroke).toHaveBeenCalled();
  expect(context.fillRect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 20, 4);
});

function createNativePrimitiveRenderTree(): VideoAnnotationTemplate['renderTree'] {
  return {
    children: [
      {
        frame: { height: 20, width: 40, x: 0, y: 0 },
        id: 'empty-label',
        nodeType: VideoAnnotationRenderNodeKind.TEXT,
        props: { text: '' },
      },
      {
        frame: { height: 40, width: 44, x: 0, y: 24 },
        id: 'right-label',
        nodeType: VideoAnnotationRenderNodeKind.TEXT,
        props: { text: 'Long aligned label' },
        style: { align: 'right', fill: '#ffffff', fontSize: 12 },
      },
      {
        frame: { height: 24, width: 80, x: 0, y: 70 },
        id: 'stroke-card',
        nodeType: VideoAnnotationRenderNodeKind.RECT,
        style: { stroke: '#2563eb', strokeWidth: 2 },
      },
      {
        frame: { height: 24, width: 80, x: 0, y: 100 },
        id: 'silent-group',
        nodeType: VideoAnnotationRenderNodeKind.GROUP,
      },
      {
        frame: { height: 24, width: 80, x: 0, y: 130 },
        id: 'plain-frame',
        nodeType: VideoAnnotationRenderNodeKind.FRAME,
        style: { stroke: '#2563eb', strokeWidth: 2 },
      },
      {
        frame: { height: 4, width: 80, x: 0, y: 164 },
        id: 'progress-bg',
        nodeType: VideoAnnotationRenderNodeKind.PROGRESS,
        props: { progress: 0.25 },
        style: { backgroundFill: '#111827', fill: '#2563eb' },
      },
    ],
    id: 'root',
    nodeType: VideoAnnotationRenderNodeKind.GROUP,
  };
}
