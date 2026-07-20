import { expect, it, vi } from 'vitest';
import {
  APPLE_GLASS_ANNOTATION_PACK,
  CURSOR_OPS_ANNOTATION_PACK,
  resolveAnnotationScene,
} from '../../../project/annotation-engine';
import { createProjectAndClip } from '../../../project/annotation-engine/resolver.test-support.ts';
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

it('renders representative Apple Glass and Cursor Ops templates through canvas primitives', () => {
  const { clip, project } = createProjectAndClip();
  const context = createContext();
  const scenes = [
    resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, 'crawling-arrow-card', clip, project, 2.45),
    resolveBuiltInScene(CURSOR_OPS_ANNOTATION_PACK, 'diff-spotlight', clip, project, 1.8),
    resolveBuiltInScene(CURSOR_OPS_ANNOTATION_PACK, 'code-reveal-title', clip, project, 1.8),
    resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, 'chapter-progress-scene', clip, project, 2.4),
  ];

  scenes.forEach((scene) => {
    drawResolvedAnnotationScene({
      context,
      displayScale: 1,
      scene,
      viewport: { height: scene.frame.height, width: scene.frame.width, x: 0, y: 0 },
    });
  });

  expect(context.arc).toHaveBeenCalled();
  expect(context.lineTo).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
  expect(context.fillRect).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
});

it('keeps first-frame modern template bodies non-blank for export rendering', () => {
  const { clip, project } = createProjectAndClip();
  const scenes = [
    resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, 'crawling-arrow-card', clip, project, 0),
    resolveBuiltInScene(CURSOR_OPS_ANNOTATION_PACK, 'command-status-lower-third', clip, project, 0),
  ];

  scenes.forEach((scene) => {
    const panel = scene.nodes.find((node) => node.id === 'panel');
    const maskProgress = Number(panel?.props['maskProgress'] ?? 1);

    expect(maskProgress).toBeGreaterThan(0.1);
  });
});

function resolveBuiltInScene(
  pack: typeof APPLE_GLASS_ANNOTATION_PACK | typeof CURSOR_OPS_ANNOTATION_PACK,
  templateId: string,
  clip: ReturnType<typeof createProjectAndClip>['clip'],
  project: ReturnType<typeof createProjectAndClip>['project'],
  currentTime: number
) {
  const template = Object.values(pack.templates)
    .flat()
    .find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`Missing built-in template ${templateId}`);
  }
  return resolveAnnotationScene({ clip, currentTime, project, template, theme: pack.theme });
}
