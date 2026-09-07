import { VideoTrackKind } from '../types';
import { expect, it } from 'vitest';
import { createAnnotationClip } from '../factories/overlay-clip';
import { createEmptyVideoProject, createVideoProjectTrack } from '../factories/creation';
import { normalizeAnnotationTemplateMetadata } from './clip-metadata';

it('preserves snapshot template fallback data while normalizing annotation metadata', () => {
  const project = createEmptyVideoProject('Annotation metadata');
  project.tracks.push(createVideoProjectTrack('Annotations', 0, VideoTrackKind.PRIMARY));
  const clip = createAnnotationClip(project.tracks[1]!.id, project.width, project.height, 0);
  const template = clip.templateSnapshot!.template!;
  clip.templateRef = { packId: 'custom.pack', templateId: 'custom-template' };
  clip.templateSnapshot = {
    capturedAtSchemaVersion: 1,
    controls: { headline: 'Snapshot headline' },
    packLabel: { fallback: 'Custom Pack' },
    template: { ...template, id: 'custom-template' },
    templateRef: clip.templateRef,
  };

  expect(normalizeAnnotationTemplateMetadata(clip, clip.templateKind)).toEqual(
    expect.objectContaining({
      templateRef: clip.templateRef,
      templateSnapshot: expect.objectContaining({
        packLabel: { fallback: 'Custom Pack' },
        template: expect.objectContaining({ id: 'custom-template' }),
      }),
    })
  );
});
