import { describe, expect, it } from 'vitest';
import { resolveAnnotationPresentation } from '../annotation/template';
import { VideoOverlayTemplateKind } from '../types/index';
import { resolveAnnotationScene, resolveClipAnnotationScene } from './index';
import {
  createProjectAndClip,
  createSceneTemplate,
  findEffect,
  findNode,
  resolveTestScene,
} from './resolver.test-support.ts';
import { createDeclarativeTemplate } from './resolver.declarative.test-support.ts';
import { VideoAnnotationTargetBindingKind, VideoAnnotationTimelinePhase } from './types';

describe('resolveAnnotationScene', () => {
  registerTimelineResolutionTests();
  registerTargetResolutionTests();
  registerDeclarativeBranchTests();
  registerFallbackResolutionTests();
});

function registerTimelineResolutionTests() {
  registerPhaseTimelineResolutionTests();
  registerPrimitiveTimelineResolutionTests();
  registerRootAnchorTests();
}

function registerPhaseTimelineResolutionTests() {
  it('evaluates phases, labels, easing, clamp, stagger, and draw progress at fixed times', () => {
    const { clip, project } = createProjectAndClip();

    const intro = resolveTestScene(project, clip, 1.25);
    expect(intro.timeline.phase).toBe(VideoAnnotationTimelinePhase.INTRO);
    expect(findNode(intro, 'dot').opacity).toBe(1);
    expect(findNode(intro, 'leader').props['progress']).toBeCloseTo(0);
    expect(findEffect(intro, 'headline-stagger').value).toBeCloseTo(0.09);

    const pathCrawl = resolveTestScene(project, clip, 1.7);
    expect(findNode(pathCrawl, 'leader').props['progress']).toBeCloseTo(0.5);
    expect(findNode(pathCrawl, 'card').props['maskProgress']).toBe(0);

    const hold = resolveTestScene(project, clip, 2.2);
    expect(hold.timeline.phase).toBe('hold');
    expect(findNode(hold, 'card').props['maskProgress']).toBe(1);
    expect(findNode(hold, 'card').transform.scale).toBe(1);

    const outro = resolveTestScene(project, clip, 3.4);
    expect(outro.timeline.phase).toBe(VideoAnnotationTimelinePhase.OUTRO);
    expect(findNode(outro, 'root').opacity).toBeCloseTo(0.5);

    const after = resolveTestScene(project, clip, 4.5);
    expect(after.timeline.phase).toBe('after');
    expect(findNode(after, 'root').opacity).toBe(0);
  });
}

function registerPrimitiveTimelineResolutionTests() {
  it('resolves the dot to leader crawl to card reveal primitive from template data', () => {
    const { clip, project } = createProjectAndClip();

    const before = resolveTestScene(project, clip, 0.8);
    expect(before.timeline.phase).toBe('before');
    expect(findNode(before, 'dot').opacity).toBe(0);

    const dotVisible = resolveTestScene(project, clip, 1.12);
    expect(findNode(dotVisible, 'dot').opacity).toBeGreaterThan(0);

    const partialPath = resolveTestScene(project, clip, 1.55);
    expect(findNode(partialPath, 'leader').props['progress']).toBeGreaterThan(0);
    expect(findNode(partialPath, 'leader').props['progress']).toBeLessThan(1);

    const cardStart = resolveTestScene(project, clip, 1.72);
    expect(findNode(cardStart, 'card').transform.scale).toBeGreaterThan(0);
    expect(findNode(cardStart, 'card').props['maskProgress']).toBeGreaterThan(0);

    const fullyVisible = resolveTestScene(project, clip, 2.1);
    expect(findNode(fullyVisible, 'card').transform.scale).toBe(1);
    expect(findNode(fullyVisible, 'headline').props['text']).toBe('Resolved headline');
    expect(findNode(fullyVisible, 'dot').style['fill']).toBe('#111827');
  });
}

function registerRootAnchorTests() {
  it('anchors frameless root groups at the label origin instead of offsetting by label size', () => {
    const { clip, project } = createProjectAndClip();

    const scene = resolveTestScene(project, clip, 2.1);
    const root = findNode(scene, 'root');
    const dot = findNode(scene, 'dot');

    expect(root.frame).toEqual({
      height: scene.presentation.labelFrame.height,
      opacity: 1,
      rotation: 0,
      width: scene.presentation.labelFrame.width,
      x: scene.presentation.labelFrame.x,
      y: scene.presentation.labelFrame.y,
    });
    expect(dot.frame.x).toBe(scene.presentation.labelFrame.x);
    expect(dot.frame.y).toBe(scene.presentation.labelFrame.y);
  });
}

function registerTargetResolutionTests() {
  it('normalizes target point and rect bindings without mutating clip geometry', () => {
    const { clip, project } = createProjectAndClip();
    const pointScene = resolveTestScene(project, clip, 1.5);
    expect(pointScene.target.point).toEqual({ x: 320, y: 180 });
    expect(pointScene.target.normalizedPoint).toEqual({ x: 0.25, y: 0.25 });

    const rectScene = resolveTestScene(
      project,
      clip,
      1.5,
      createSceneTemplate(VideoAnnotationTargetBindingKind.RECT)
    );
    expect(rectScene.target.rect).toEqual({ height: 80, width: 160, x: 400, y: 240 });
    expect(rectScene.target.normalizedRect).toEqual({
      height: 80 / 720,
      width: 160 / 1280,
      x: 400 / 1280,
      y: 240 / 720,
    });
    expect(clip.targetRect).toEqual({ height: 80, width: 160, x: 400, y: 240 });
  });

  it('honors explicit target geometry overrides and zero-sized normalization guards', () => {
    const { clip, project } = createProjectAndClip();
    const scene = resolveAnnotationScene({
      clip,
      currentTime: 1.5,
      project: { ...project, height: 0, width: 0 },
      targetGeometry: {
        point: { x: 12, y: 20 },
        rect: { height: 10, width: 30, x: 40, y: 50 },
      },
      template: createSceneTemplate(VideoAnnotationTargetBindingKind.RECT),
    });

    expect(scene.target.point).toEqual({ x: 12, y: 20 });
    expect(scene.target.rect).toEqual({ height: 10, width: 30, x: 40, y: 50 });
    expect(scene.target.normalizedPoint).toEqual({ x: 0, y: 0 });
    expect(scene.target.normalizedRect).toEqual({ height: 0, width: 0, x: 0, y: 0 });
  });
}

function registerDeclarativeBranchTests() {
  it('applies declarative content, style, and node property branches', () => {
    const { clip, project } = createProjectAndClip();
    const template = createSceneTemplate();
    clip.templateControlValues = {
      badge: 'Beta',
      cardFill: '#fafafa',
      headline: 'Field headline',
      subline: 'Field subline',
    };
    const scene = resolveAnnotationScene({
      clip,
      currentTime: 1.4,
      project,
      template: createDeclarativeTemplate(template),
    });

    expect(findNode(scene, 'headline').props['text']).toBe('Field headline');
    expect(findNode(scene, 'card').style['fill']).toBe('#fafafa');
    expect(findNode(scene, 'card').transform.rotation).toBeGreaterThan(0);
    expect(findNode(scene, 'card').transform.blurPx).toBeGreaterThan(0);
    expect(findNode(scene, 'dot').style['fill']).toBe('#000000');
    expect(findNode(scene, 'headline').props['customData']).toBe('b');
  });
}

function registerFallbackResolutionTests() {
  it('falls back to a legacy template ref when a stored pack reference disappears', () => {
    const { clip, project } = createProjectAndClip();
    clip.templateRef = { packId: 'missing.pack', templateId: 'missing-template' };

    const scene = resolveClipAnnotationScene({ clip, currentTime: 1.4, project });

    expect(scene.renderTree.id).toBe('root');
    expect(scene.nodes.length).toBeGreaterThan(1);
  });

  it('is deterministic for the same project, clip, template, and time input', () => {
    const { clip, project } = createProjectAndClip();
    const template = createSceneTemplate();

    expect(resolveTestScene(project, clip, 1.75, template)).toEqual(
      resolveTestScene(project, clip, 1.75, template)
    );
  });

  it('keeps legacy annotation clips on a compatible scene and presentation path', () => {
    const { clip, project } = createProjectAndClip();
    clip.templateKind = VideoOverlayTemplateKind.CALLOUT_CONNECTOR;

    const scene = resolveClipAnnotationScene({ clip, currentTime: 1.4, project });
    const presentation = resolveAnnotationPresentation(project, clip, 1.4);

    expect(scene.frame).toEqual(presentation.frame);
    expect(scene.presentation.labelFrame).toEqual(presentation.labelFrame);
    expect(scene.nodes.length).toBeGreaterThan(1);
    expect(scene.renderTree.id).toBe('root');
    expect(scene.timeline.phase).not.toBe('before');
  });
}
