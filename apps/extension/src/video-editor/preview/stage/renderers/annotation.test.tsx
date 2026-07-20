// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  APPLE_GLASS_ANNOTATION_PACK,
  CURSOR_OPS_ANNOTATION_PACK,
  resolveClipAnnotationScene,
  type VideoAnnotationPack,
} from '../../../../features/video/project/annotation-engine';
import { createAnnotationClip } from '../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../../features/video/project/types';
import { renderAnnotationPreviewClip } from './annotation';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderAnnotation(templateKind: VideoOverlayTemplateKind, currentTime = 0.7) {
  const project = createEmptyVideoProject('Preview', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    templateKind
  );
  clip.duration = 4;
  clip.content.headline = 'Preview headline';
  clip.content.subline = 'Visible subline';
  clip.templateControlValues = {
    ...clip.templateControlValues,
    headline: 'Preview headline',
  };

  act(() => {
    root?.render(
      renderAnnotationPreviewClip({
        clip,
        currentTime,
        onBeginInteraction: vi.fn(),
        project,
        selectedClipId: null,
      })
    );
  });

  return {
    button: container?.querySelector('button'),
    scene: resolveClipAnnotationScene({ clip, currentTime, project }),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders modern annotation preview from the resolved scene node tree', () => {
  const { button, scene } = renderModernAnnotation(
    CURSOR_OPS_ANNOTATION_PACK,
    'command-status-lower-third',
    1.2,
    'Preview headline'
  );

  expect(
    button?.querySelector('[data-annotation-scene]')?.getAttribute('data-annotation-scene')
  ).toBe(scene.clipId);
  expect(button?.querySelector('[data-annotation-node="panel"]')).not.toBeNull();
  expect(button?.querySelector('[data-annotation-node="headline"]')?.textContent).toContain(
    'Preview headline'
  );
});

it('renders legacy template-kind clips through the modern scene fallback', () => {
  const { button } = renderAnnotation(VideoOverlayTemplateKind.LOWER_THIRD_BASIC);

  expect(button?.dataset['annotationRenderer']).toBe('scene');
  expect(button?.querySelector('[data-annotation-scene]')).not.toBeNull();
  expect(button?.textContent).toContain('Preview headline');
});

it('renders modern built-in annotations with visible body and text immediately after add', () => {
  const apple = renderModernAnnotation(
    APPLE_GLASS_ANNOTATION_PACK,
    'lens-pin-callout',
    1.7,
    'Apple visible headline'
  );
  const cursor = renderModernAnnotation(
    CURSOR_OPS_ANNOTATION_PACK,
    'inline-symbol-pointer',
    1.2,
    'Cursor visible headline'
  );

  expect(apple.button?.dataset['annotationRenderer']).toBe('scene');
  expect(
    apple.button?.querySelector<HTMLElement>('[data-annotation-node="panel"]')?.style.background
  ).not.toBe('');
  expect(apple.button?.textContent).toContain('Apple visible headline');
  expect(
    apple.button?.querySelector<HTMLElement>('[data-annotation-node="headline"]')?.style.color
  ).not.toBe('');
  expect(cursor.button?.dataset['annotationRenderer']).toBe('scene');
  expect(
    cursor.button?.querySelector<HTMLElement>('[data-annotation-node="panel"]')?.style.background
  ).not.toBe('');
  expect(cursor.button?.textContent).toContain('Cursor visible headline');
});

it('keeps selected modern annotations visibly distinct from empty selection chrome at the first frame', () => {
  const apple = renderModernAnnotation(
    APPLE_GLASS_ANNOTATION_PACK,
    'crawling-arrow-card',
    0,
    'First frame Apple body'
  );
  const cursor = renderModernAnnotation(
    CURSOR_OPS_ANNOTATION_PACK,
    'command-status-lower-third',
    0,
    'First frame Cursor body'
  );

  expect(resolveMaskProgress(apple.button, 'panel')).toBeGreaterThan(0.1);
  expect(resolveMaskProgress(cursor.button, 'panel')).toBeGreaterThan(0.1);
  expect(resolveOpacity(apple.button, 'dot')).toBeGreaterThan(0.1);
  expect(apple.button?.textContent).toContain('First frame Apple body');
  expect(cursor.button?.textContent).toContain('First frame Cursor body');
});

it('renders technical dot-arrow-card motion from the same resolved scene data', () => {
  const { button, scene } = renderModernAnnotation(
    APPLE_GLASS_ANNOTATION_PACK,
    'crawling-arrow-card',
    1.5,
    'Preview headline'
  );
  const leader = button?.querySelector('[data-annotation-node="leader"]');
  const card = button?.querySelector<HTMLElement>('[data-annotation-node="panel"]');

  expect(scene.nodes.map((node) => node.id)).toEqual(
    expect.arrayContaining(['dot', 'leader', 'panel', 'headline'])
  );
  const leaderProgress = Number(
    scene.nodes.find((node) => node.id === 'leader')?.props['progress']
  );
  expect(leader?.getAttribute('data-annotation-node-progress')).toBe(leaderProgress.toFixed(3));
  expect(button?.innerHTML).toContain('<polygon');
  if (Number(scene.nodes.find((node) => node.id === 'panel')?.props['maskProgress']) < 1) {
    expect(card?.style.clipPath).toContain('inset(');
  }
});

it('keeps target-aware overlays interactive through the preview wrapper', () => {
  const { button } = renderAnnotation(VideoOverlayTemplateKind.POINTER_LABEL);

  expect(button?.dataset['annotationLayout']).toBe('MARKER');
  expect(button?.className).toContain('overflow-visible');
  expect(button?.dataset['annotationRenderer']).toBe('scene');
  expect(button?.textContent).toContain('Preview headline');
});

function renderModernAnnotation(
  pack: VideoAnnotationPack,
  templateId: string,
  currentTime: number,
  headline: string
) {
  const project = createEmptyVideoProject('Preview', 1280, 720);
  const template = Object.values(pack.templates)
    .flat()
    .find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`Missing template ${templateId}`);
  }
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0, {
    pack,
    packLabel: pack.label,
    packTheme: pack.theme,
    template,
    templateRef: { packId: pack.packId, templateId },
  });
  clip.content.headline = headline;
  clip.templateControlValues = { ...clip.templateControlValues, headline };

  act(() => {
    root?.render(
      renderAnnotationPreviewClip({
        clip,
        currentTime,
        onBeginInteraction: vi.fn(),
        project,
        selectedClipId: null,
      })
    );
  });

  return {
    button: container?.querySelector('button'),
    scene: resolveClipAnnotationScene({ clip, currentTime, project }),
  };
}

function resolveMaskProgress(button: HTMLButtonElement | null | undefined, nodeId: string) {
  const node = button?.querySelector<HTMLElement>(`[data-annotation-node="${nodeId}"]`);
  const clipPath = node?.style.clipPath ?? '';
  if (!clipPath) {
    return 1;
  }
  const hiddenPercent = Number(clipPath.match(/inset\((?:0|0px) ([\d.]+)%/)?.[1] ?? '100');
  return 1 - hiddenPercent / 100;
}

function resolveOpacity(button: HTMLButtonElement | null | undefined, nodeId: string) {
  const node = button?.querySelector<HTMLElement>(`[data-annotation-node="${nodeId}"]`);
  return Number(node?.style.opacity || '1');
}
