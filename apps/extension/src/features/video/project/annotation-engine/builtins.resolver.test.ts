import { describe, expect, it } from 'vitest';
import { createProjectAndClip, findNode } from './resolver.test-support.ts';
import { APPLE_GLASS_ANNOTATION_PACK, CURSOR_OPS_ANNOTATION_PACK } from './builtins/index';
import { createVideoAnnotationControlValues } from './parser';
import { resolveAnnotationScene, resolveClipAnnotationScene } from './resolver';

describe('built-in annotation theme resolver', () => {
  registerBuiltInAnimationTests();
  registerBuiltInThemeResolutionTests();
  registerBuiltInFallbackTests();
});

function registerBuiltInAnimationTests() {
  it('resolves Apple Glass crawling arrow as dot to arrow to card sequence', () => {
    const { clip, project } = createProjectAndClip();
    const template = getBuiltInTemplate(APPLE_GLASS_ANNOTATION_PACK, 'crawling-arrow-card');

    const start = resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, template, clip, project, 1);
    expect(findNode(start, 'root').opacity).toBeGreaterThan(0.1);

    const dot = resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, template, clip, project, 1.18);
    expect(findNode(dot, 'dot').opacity).toBeGreaterThan(0);
    expect(findNode(dot, 'leader').props['progress']).toBe(0);
    expect(findNode(dot, 'panel').props['maskProgress']).toBeGreaterThan(0.1);

    const arrow = resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, template, clip, project, 1.7);
    expect(findNode(arrow, 'leader').props['progress']).toBeGreaterThan(0);
    expect(findNode(arrow, 'leader').props['progress']).toBeLessThan(1);
    expect(findNode(arrow, 'panel').props['maskProgress']).toBeGreaterThan(0.1);

    const card = resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, template, clip, project, 2.45);
    expect(findNode(card, 'leader').props['progress']).toBe(1);
    expect(findNode(card, 'panel').props['maskProgress']).toBe(1);
  });

  it('applies timeline duration and easing controls before resolving motion', () => {
    const { clip, project } = createProjectAndClip();
    const template = getBuiltInTemplate(CURSOR_OPS_ANNOTATION_PACK, 'operation-timeline-scene');
    clip.templateControlValues = { durationMs: 1600, easing: 'linear' };

    const scene = resolveBuiltInScene(CURSOR_OPS_ANNOTATION_PACK, template, clip, project, 1.8);

    expect(
      scene.timeline.effects.find((effect) => effect.id === 'progress-draw')?.value
    ).toBeCloseTo(1);
    expect(scene.timeline.phase).toBe('hold');
  });
}

function registerBuiltInThemeResolutionTests() {
  registerBuiltInTemplateRefTests();
  registerBuiltInColorTests();
  registerBuiltInTextPlacementTests();
}

function registerBuiltInTemplateRefTests() {
  it('resolves built-in template refs with their pack theme on the shared clip scene path', () => {
    const { clip, project } = createProjectAndClip();
    const template = getBuiltInTemplate(APPLE_GLASS_ANNOTATION_PACK, 'lens-pin-callout');
    clip.templateRef = {
      packId: APPLE_GLASS_ANNOTATION_PACK.packId,
      templateId: template.id,
    };
    clip.templateControlValues = createVideoAnnotationControlValues(template.controls);

    const scene = resolveClipAnnotationScene({ clip, currentTime: 1.4, project });

    expect(findNode(scene, 'pin').style['stroke']).toBe('#2f7cf6');
    expect(scene.renderTree.id).toBe('root');
  });
}

function registerBuiltInColorTests() {
  it('resolves modern built-ins with visible panel and text colors by default', () => {
    const { clip, project } = createProjectAndClip();
    const appleTemplate = getBuiltInTemplate(APPLE_GLASS_ANNOTATION_PACK, 'lens-pin-callout');
    const cursorTemplate = getBuiltInTemplate(CURSOR_OPS_ANNOTATION_PACK, 'inline-symbol-pointer');

    const appleScene = resolveBuiltInScene(
      APPLE_GLASS_ANNOTATION_PACK,
      appleTemplate,
      clip,
      project,
      1.7
    );
    const cursorScene = resolveBuiltInScene(
      CURSOR_OPS_ANNOTATION_PACK,
      cursorTemplate,
      clip,
      project,
      1.2
    );

    expect(findNode(appleScene, 'panel').style['fill']).toBe('rgba(15,23,42,0.76)');
    expect(findNode(appleScene, 'headline').style['fill']).toBe('#f8fafc');
    expect(findNode(cursorScene, 'panel').style['fill']).toBe('#fff7ed');
    expect(findNode(cursorScene, 'headline').style['fill']).toBe('#171412');
  });
}

function registerBuiltInTextPlacementTests() {
  it('keeps animated built-in text positioned inside its parent panel', () => {
    const { clip, project } = createProjectAndClip();
    const template = getBuiltInTemplate(APPLE_GLASS_ANNOTATION_PACK, 'lens-pin-callout');

    const scene = resolveBuiltInScene(APPLE_GLASS_ANNOTATION_PACK, template, clip, project, 1.7);
    const panel = findNode(scene, 'panel');
    const headline = findNode(scene, 'headline');
    const subline = findNode(scene, 'subline');

    expect(headline.frame.x).toBeGreaterThan(panel.frame.x);
    expect(headline.frame.y).toBeGreaterThanOrEqual(panel.frame.y);
    expect(headline.frame.x + headline.frame.width).toBeLessThanOrEqual(
      panel.frame.x + panel.frame.width
    );
    expect(subline.frame.y).toBeGreaterThan(headline.frame.y);
    expect(subline.frame.y).toBeLessThan(panel.frame.y + panel.frame.height);
  });
}

function registerBuiltInFallbackTests() {
  it('falls back to a legacy scene when a stored built-in pack reference is unavailable', () => {
    const { clip, project } = createProjectAndClip();
    clip.templateRef = { packId: 'missing.pack', templateId: 'missing-template' };

    const scene = resolveClipAnnotationScene({ clip, currentTime: 1.4, project });

    expect(scene.renderTree.id).toBe('root');
    expect(scene.nodes.length).toBeGreaterThan(1);
  });
}

function resolveBuiltInScene(
  pack: typeof APPLE_GLASS_ANNOTATION_PACK | typeof CURSOR_OPS_ANNOTATION_PACK,
  template: ReturnType<typeof getBuiltInTemplate>,
  clip: ReturnType<typeof createProjectAndClip>['clip'],
  project: ReturnType<typeof createProjectAndClip>['project'],
  currentTime: number
) {
  return resolveAnnotationScene({ clip, currentTime, project, template, theme: pack.theme });
}

function getBuiltInTemplate(
  pack: typeof APPLE_GLASS_ANNOTATION_PACK | typeof CURSOR_OPS_ANNOTATION_PACK,
  templateId: string
) {
  const template = Object.values(pack.templates)
    .flat()
    .find((candidate) => candidate.id === templateId);
  expect(template).toBeDefined();
  return template!;
}
