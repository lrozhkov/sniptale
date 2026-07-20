import { expect, it } from 'vitest';
import { APPLE_GLASS_ANNOTATION_PACK } from '../../../project/annotation-engine';
import { createAnnotationClip } from '../../../project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { VideoOverlayTemplateKind } from '../../../project/types/index';
import { createAnnotationVisualLayer } from './annotation-layer';

it('creates target-aware annotation visual layers with resolved frame bounds', () => {
  const project = createEmptyVideoProject('Annotation layer', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.POINTER_LABEL
  );

  const layer = createAnnotationVisualLayer(clip, 0.2, project, 4);

  expect(layer).toEqual(
    expect.objectContaining({
      clipId: clip.id,
      kind: 'annotation',
      width: expect.any(Number),
      zIndex: 4,
    })
  );
  expect(layer.width).toBeGreaterThan(clip.transform.width);
  expect(layer.clip).toEqual(
    expect.objectContaining({
      renderFamily: 'MARKER',
      target: 'POINT',
      targetPoint: clip.targetPoint,
      templateKind: 'POINTER_LABEL',
    })
  );
  expect('scene' in layer.clip).toBe(false);
});

it('attaches a declarative scene only for modern built-in annotation packs', () => {
  const project = createEmptyVideoProject('Annotation layer', 1280, 720);
  const template = Object.values(APPLE_GLASS_ANNOTATION_PACK.templates)
    .flat()
    .find((candidate) => candidate.id === 'lens-pin-callout');
  if (!template) {
    throw new Error('Missing lens-pin-callout template.');
  }
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0, {
    pack: APPLE_GLASS_ANNOTATION_PACK,
    packLabel: APPLE_GLASS_ANNOTATION_PACK.label,
    packTheme: APPLE_GLASS_ANNOTATION_PACK.theme,
    template,
    templateRef: { packId: APPLE_GLASS_ANNOTATION_PACK.packId, templateId: template.id },
  });

  const layer = createAnnotationVisualLayer(clip, 1.7, project, 4);

  expect(layer.clip.scene).toEqual(
    expect.objectContaining({
      clipId: clip.id,
      renderTree: expect.objectContaining({ id: 'root' }),
    })
  );
  expect(layer).toEqual(
    expect.objectContaining({
      height: clip.transform.height,
      width: clip.transform.width,
      x: clip.transform.x,
      y: clip.transform.y,
    })
  );
});
