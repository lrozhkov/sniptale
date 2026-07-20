// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
import {
  APPLE_GLASS_ANNOTATION_PACK,
  CURSOR_OPS_ANNOTATION_PACK,
  type VideoAnnotationPack,
  type VideoAnnotationTemplate,
} from '../../../../features/video/project/annotation-engine';
import { createAnnotationClip } from '../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoMotionOverlayZoomMode,
  VideoOverlayTemplateKind,
} from '../../../../features/video/project/types';
import { PreviewStageAnnotationTargetOverlay } from './index';

function createCamera(overrides: Partial<VideoCompositionCameraState> = {}) {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
    ...overrides,
  } as const;
}

function createStage(width = 220, height = 140) {
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
  return stage;
}

function createModernTargetProject(pack: VideoAnnotationPack, template: VideoAnnotationTemplate) {
  const project = createEmptyVideoProject('Targets', 200, 100);
  const clip = createAnnotationClip(project.tracks[2]!.id, 200, 100, 0, {
    pack,
    packLabel: pack.label,
    packTheme: pack.theme,
    template,
    templateRef: { packId: pack.packId, templateId: template.id },
  });
  project.clips = [clip] as never;
  return { clip, project };
}

function getTemplate(pack: VideoAnnotationPack, templateId: string): VideoAnnotationTemplate {
  const template = Object.values(pack.templates)
    .flat()
    .find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`Missing annotation template ${templateId}.`);
  }
  return template;
}

function renderTargetOverlay(
  props: React.ComponentProps<typeof PreviewStageAnnotationTargetOverlay>
) {
  act(() => {
    root?.render(<PreviewStageAnnotationTargetOverlay {...props} />);
  });
}

function dispatchPointerDrag(
  target: Element | null,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const pointerDownEvent = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(pointerDownEvent, 'clientX', { value: start.x });
  Object.defineProperty(pointerDownEvent, 'clientY', { value: start.y });

  act(() => {
    target?.dispatchEvent(pointerDownEvent);
  });

  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: end.x });
  Object.defineProperty(moveEvent, 'clientY', { value: end.y });

  act(() => {
    window.dispatchEvent(moveEvent);
    window.dispatchEvent(new Event('pointerup'));
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('fits pointer target handles into the centered fullscreen viewport', () => {
  const { clip, project } = createModernTargetProject(
    APPLE_GLASS_ANNOTATION_PACK,
    getTemplate(APPLE_GLASS_ANNOTATION_PACK, 'lens-pin-callout')
  );
  const stage = createStage();
  clip.targetPoint = { x: 60, y: 50 };

  renderTargetOverlay({
    camera: createCamera(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    project,
    selectedClip: clip,
    selectedClipLocked: false,
    stageRef: { current: stage },
  });

  const handle = container?.querySelector('[data-preview-annotation-target-handle="point"]');
  expect(handle).toBeTruthy();
  expect(parseFloat((handle as HTMLElement).style.left)).toBeCloseTo(30, 4);
  expect(parseFloat((handle as HTMLElement).style.top)).toBeCloseTo(50, 4);
});

it('moves rect targets on canvas drag for connector annotations', () => {
  const { clip, project } = createModernTargetProject(
    CURSOR_OPS_ANNOTATION_PACK,
    getTemplate(CURSOR_OPS_ANNOTATION_PACK, 'diagnostic-stack-callout')
  );
  const onUpdateAnnotationClipTemplate = vi.fn();
  const stage = createStage();
  clip.targetRect = { height: 20, width: 40, x: 80, y: 40 };

  renderTargetOverlay({
    camera: createCamera(),
    onUpdateAnnotationClipTemplate,
    project,
    selectedClip: clip,
    selectedClipLocked: false,
    stageRef: { current: stage },
  });

  const targetRect =
    container?.querySelector('[data-preview-annotation-target-rect="true"]') ?? null;
  expect(targetRect).toBeTruthy();

  dispatchPointerDrag(targetRect, { x: 99, y: 59 }, { x: 121, y: 70 });

  const [clipId, patch] = onUpdateAnnotationClipTemplate.mock.lastCall ?? [];
  expect(clipId).toBe(clip.id);
  expect(patch).toEqual({
    targetRect: { height: 20, width: 40, x: expect.closeTo(100, 8), y: 50 },
  });
});

it('shows target rect handles for bracket-style callout cards too', () => {
  const { clip, project } = createModernTargetProject(
    CURSOR_OPS_ANNOTATION_PACK,
    getTemplate(CURSOR_OPS_ANNOTATION_PACK, 'diagnostic-stack-callout')
  );
  const stage = createStage();

  renderTargetOverlay({
    camera: createCamera(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    project,
    selectedClip: clip,
    selectedClipLocked: false,
    stageRef: { current: stage },
  });

  const targetRect =
    container?.querySelector('[data-preview-annotation-target-rect="true"]') ?? null;
  expect(targetRect).toBeTruthy();
});

it('uses modern template target support before legacy templateKind fallback', () => {
  const project = createEmptyVideoProject('Modern targets', 200, 100);
  const template = Object.values(APPLE_GLASS_ANNOTATION_PACK.templates)
    .flat()
    .find((candidate) => candidate.id === 'soft-spotlight');
  if (!template) {
    throw new Error('Missing soft-spotlight template.');
  }
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0, {
    pack: APPLE_GLASS_ANNOTATION_PACK,
    packLabel: APPLE_GLASS_ANNOTATION_PACK.label,
    packTheme: APPLE_GLASS_ANNOTATION_PACK.theme,
    template,
    templateRef: { packId: APPLE_GLASS_ANNOTATION_PACK.packId, templateId: template.id },
  });
  clip.templateKind = VideoOverlayTemplateKind.LOWER_THIRD_BASIC;
  clip.target = 'RECT';
  clip.targetRect = { height: 20, width: 40, x: 80, y: 40 };
  const stage = createStage();

  renderTargetOverlay({
    camera: createCamera(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    project,
    selectedClip: clip,
    selectedClipLocked: false,
    stageRef: { current: stage },
  });

  expect(container?.querySelector('[data-preview-annotation-target-rect="true"]')).toBeTruthy();
});

it('keeps point handles anchored and usable on tiny fitted stages', () => {
  const { clip, project } = createModernTargetProject(
    APPLE_GLASS_ANNOTATION_PACK,
    getTemplate(APPLE_GLASS_ANNOTATION_PACK, 'lens-pin-callout')
  );
  const stage = createStage(120, 60);
  clip.targetPoint = { x: 60, y: 50 };

  renderTargetOverlay({
    camera: createCamera(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    project,
    selectedClip: clip,
    selectedClipLocked: false,
    stageRef: { current: stage },
  });

  const handle = container?.querySelector('[data-preview-annotation-target-handle="point"]');
  expect(handle).toBeTruthy();
  expect(parseFloat((handle as HTMLElement).style.left)).toBeCloseTo(30, 4);
  expect(parseFloat((handle as HTMLElement).style.top)).toBeCloseTo(50, 4);
  expect(parseFloat((handle as HTMLElement).style.width)).toBeGreaterThanOrEqual(14);
});

it('keeps locked connector targets fixed on stage when the camera zooms and pans', () => {
  const { clip, project } = createModernTargetProject(
    CURSOR_OPS_ANNOTATION_PACK,
    getTemplate(CURSOR_OPS_ANNOTATION_PACK, 'diagnostic-stack-callout')
  );
  const stage = createStage();
  clip.targetRect = { height: 20, width: 40, x: 80, y: 40 };

  renderTargetOverlay({
    camera: createCamera({ scale: 2, viewportX: 40, viewportY: 20 }),
    onUpdateAnnotationClipTemplate: vi.fn(),
    project,
    selectedClip: clip,
    selectedClipLocked: false,
    stageRef: { current: stage },
  });

  const targetRect = container?.querySelector(
    '[data-preview-annotation-target-rect="true"]'
  ) as HTMLElement | null;
  expect(targetRect).toBeTruthy();
  expect(parseFloat(targetRect!.style.left)).toBeCloseTo(40, 4);
  expect(parseFloat(targetRect!.style.top)).toBeCloseTo(42.142857, 4);
  expect(parseFloat(targetRect!.style.width)).toBeCloseTo(20, 4);
  expect(parseFloat(targetRect!.style.height)).toBeCloseTo(15.714286, 4);
});
