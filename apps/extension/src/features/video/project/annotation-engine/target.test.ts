import { expect, it } from 'vitest';
import { createProjectAndClip, createSceneTemplate } from './resolver.test-support.ts';
import { resolveAnnotationSceneTarget } from './target';
import { VideoAnnotationTargetBindingKind } from './types';

it('honors explicit target geometry overrides without mutating clip targets', () => {
  const { clip, project } = createProjectAndClip();
  const point = { x: 12, y: 20 };
  const rect = { height: 10, width: 30, x: 40, y: 50 };

  const target = resolveAnnotationSceneTarget({
    clip,
    project,
    targetGeometry: { point, rect },
    template: createSceneTemplate(VideoAnnotationTargetBindingKind.RECT),
  });

  expect(target.point).toEqual(point);
  expect(target.rect).toEqual(rect);
  expect(clip.targetPoint).toEqual({ x: 320, y: 180 });
  expect(clip.targetRect).toEqual({ height: 80, width: 160, x: 400, y: 240 });
});

it('keeps optional target geometry empty for templates without target binding', () => {
  const { clip, project } = createProjectAndClip();
  clip.targetPoint = null;
  clip.targetRect = null;

  const target = resolveAnnotationSceneTarget({
    clip,
    project: { ...project, height: 0, width: 0 },
    template: createSceneTemplate(VideoAnnotationTargetBindingKind.NONE),
  });

  expect(target.point).toBeNull();
  expect(target.rect).toBeNull();
  expect(target.normalizedPoint).toBeNull();
  expect(target.normalizedRect).toBeNull();
});

it('uses visible default target geometry for target-bound modern scenes', () => {
  const { clip, project } = createProjectAndClip();
  clip.targetPoint = null;
  clip.targetRect = null;

  const pointTarget = resolveAnnotationSceneTarget({
    clip,
    project,
    template: createSceneTemplate(VideoAnnotationTargetBindingKind.POINT),
  });
  const rectTarget = resolveAnnotationSceneTarget({
    clip,
    project,
    template: createSceneTemplate(VideoAnnotationTargetBindingKind.RECT),
  });

  expect(pointTarget.point).toEqual({ x: project.width / 2, y: project.height / 2 });
  expect(rectTarget.rect).toEqual(
    expect.objectContaining({
      height: expect.any(Number),
      width: expect.any(Number),
      x: expect.any(Number),
      y: expect.any(Number),
    })
  );
  expect(rectTarget.rect?.width).toBeGreaterThan(0);
  expect(rectTarget.rect?.height).toBeGreaterThan(0);
});
