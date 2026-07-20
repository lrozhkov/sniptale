import { expect, it } from 'vitest';
import { APPLE_GLASS_ANNOTATION_PACK } from '../../project/annotation-engine';
import { createAnnotationClip } from '../../project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../project/factories/creation';
import { VideoOverlayTemplateKind } from '../../project/types';
import { resolveCompositionAnnotationClip } from './resolved-clip';

it('resolves legacy annotation presentation without a declarative scene', () => {
  const project = createEmptyVideoProject('Resolved annotation', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.POINTER_LABEL
  );

  const resolved = resolveCompositionAnnotationClip(clip, 0.2, project);

  expect(resolved).toEqual(
    expect.objectContaining({
      id: clip.id,
      presentation: expect.any(Object),
      targetPoint: clip.targetPoint,
      trackId: clip.trackId,
    })
  );
  expect('scene' in resolved).toBe(false);
});

it('attaches the resolved scene for a modern annotation pack', () => {
  const project = createEmptyVideoProject('Resolved annotation', 1280, 720);
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

  const resolved = resolveCompositionAnnotationClip(clip, 1.7, project);

  expect(resolved.scene).toEqual(
    expect.objectContaining({
      clipId: clip.id,
      renderTree: expect.objectContaining({ id: 'root' }),
    })
  );
});
