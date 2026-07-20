import { expect, it } from 'vitest';
import {
  APPLE_GLASS_ANNOTATION_PACK,
  getLegacyAnnotationTemplateRef,
  resolveVideoAnnotationTemplate,
} from '../annotation-engine';
import { createEmptyVideoProject } from '../factories/creation';
import { VideoOverlayTemplateKind, VideoTemplateDirection } from '../types/index';
import {
  applyAnnotationTemplatePreset,
  applyAnnotationTemplateStyleSwap,
  createAnnotationClip,
  resolveAnnotationPresentation,
} from './template';

it('creates annotation clips with declarative template metadata snapshots', () => {
  const project = createEmptyVideoProject('Annotation engine', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );
  const templateRef = getLegacyAnnotationTemplateRef(VideoOverlayTemplateKind.CALLOUT_CONNECTOR);

  expect(clip.templateRef).toEqual(templateRef);
  expect(clip.templateControlValues).toEqual({
    accent: '#2563eb',
    headline: 'System state',
  });
  expect(clip.templateSnapshot).toEqual(
    expect.objectContaining({
      capturedAtSchemaVersion: 1,
      controls: clip.templateControlValues,
      templateRef,
      template: expect.objectContaining({ id: VideoOverlayTemplateKind.CALLOUT_CONNECTOR }),
    })
  );
  expect(resolveVideoAnnotationTemplate(clip).status).toBe('resolved');
});

it('creates annotation clips from built-in template refs with snapshots and field defaults', () => {
  const project = createEmptyVideoProject('Annotation engine', 1280, 720);
  const template = APPLE_GLASS_ANNOTATION_PACK.templates.callout.find(
    (candidate) => candidate.id === 'crawling-arrow-card'
  );
  if (!template) {
    throw new Error('Expected Apple Glass callout template');
  }

  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0, {
    packLabel: APPLE_GLASS_ANNOTATION_PACK.label,
    template,
    templateRef: {
      packId: APPLE_GLASS_ANNOTATION_PACK.packId,
      templateId: template.id,
    },
  });

  expect(clip.name).toBe('Guided Arrow Card');
  expect(clip.content.headline).toBe('Обратите внимание');
  expect(clip.templateSnapshot).toEqual(
    expect.objectContaining({
      packLabel: APPLE_GLASS_ANNOTATION_PACK.label,
      template: expect.objectContaining({ id: 'crawling-arrow-card' }),
      templateRef: {
        packId: APPLE_GLASS_ANNOTATION_PACK.packId,
        templateId: 'crawling-arrow-card',
      },
    })
  );
  expect(resolveVideoAnnotationTemplate(clip).status).toBe('resolved');
});

it('updates declarative template metadata when applying legacy template presets', () => {
  const project = createEmptyVideoProject('Annotation engine', 1280, 720);
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 0);
  const updatedClip = applyAnnotationTemplatePreset(
    clip,
    project.width,
    project.height,
    VideoOverlayTemplateKind.TITLE_REVEAL
  );

  expect(updatedClip.templateRef).toEqual(
    getLegacyAnnotationTemplateRef(VideoOverlayTemplateKind.TITLE_REVEAL)
  );
  expect(updatedClip.templateRef).not.toEqual(clip.templateRef);
});

it('keeps template metadata while preserving user geometry during style swaps', () => {
  const project = createEmptyVideoProject('Annotation engine', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );
  const swappedClip = applyAnnotationTemplateStyleSwap(
    clip,
    project.width,
    project.height,
    VideoOverlayTemplateKind.POINTER_LABEL
  );

  expect(swappedClip.transform).toEqual(clip.transform);
  expect(swappedClip.target).toBe(clip.target);
  expect(swappedClip.templateRef).toEqual(
    getLegacyAnnotationTemplateRef(VideoOverlayTemplateKind.POINTER_LABEL)
  );
});

it('resolves annotation presentation for regular and side-panel template geometry', () => {
  const project = createEmptyVideoProject('Annotation engine', 1280, 720);
  const lowerThirdClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0
  );
  const leftPanelClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL
  );
  const rightPanelClip = {
    ...leftPanelClip,
    direction: VideoTemplateDirection.RIGHT,
  };
  project.clips = [lowerThirdClip, leftPanelClip, rightPanelClip];

  expect(resolveAnnotationPresentation(project, lowerThirdClip, 1).labelFrame).toEqual({
    height: lowerThirdClip.transform.height,
    width: lowerThirdClip.transform.width,
    x: lowerThirdClip.transform.x,
    y: lowerThirdClip.transform.y,
  });
  expect(resolveAnnotationPresentation(project, leftPanelClip, 1).labelFrame.x).toBe(0);
  expect(resolveAnnotationPresentation(project, rightPanelClip, 1).labelFrame.x).toBeGreaterThan(0);
  expect(
    resolveAnnotationPresentation(
      { height: project.height, width: project.width },
      lowerThirdClip,
      1
    ).frame.opacity
  ).toBeGreaterThan(0);
});
