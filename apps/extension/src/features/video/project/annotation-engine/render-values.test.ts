import { expect, it } from 'vitest';
import { mapAnnotationSceneFrame } from './render-values';
import { createProjectAndClip, resolveTestScene } from './resolver.test-support.ts';

it('maps scene frames from an explicit source frame when rendering body viewports', () => {
  const { clip, project } = createProjectAndClip();
  const scene = resolveTestScene(project, clip, 1.4);
  const sourceFrame = { height: 80, width: 200, x: 100, y: 120 };
  const viewport = { height: 160, width: 400, x: 10, y: 20 };

  expect(
    mapAnnotationSceneFrame({
      frame: { height: 20, width: 40, x: 130, y: 150 },
      scene,
      sourceFrame,
      viewport,
    })
  ).toEqual({
    height: 40,
    width: 80,
    x: 70,
    y: 80,
  });
});
