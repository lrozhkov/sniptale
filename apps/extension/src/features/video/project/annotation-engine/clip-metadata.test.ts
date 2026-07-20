import { expect, it } from 'vitest';
import { createAnnotationClip } from '../factories/overlay-clip';
import { createEmptyVideoProject } from '../factories/creation';
import { normalizeAnnotationTemplateMetadata } from './clip-metadata';

it('preserves snapshot template fallback data while normalizing annotation metadata', () => {
  const project = createEmptyVideoProject('Annotation metadata');
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0);
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
