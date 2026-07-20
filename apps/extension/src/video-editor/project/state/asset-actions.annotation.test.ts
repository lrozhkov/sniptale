import { describe, expect, it, vi } from 'vitest';
import { APPLE_GLASS_ANNOTATION_PACK } from '../../../features/video/project/annotation-engine';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import {
  VideoBlockKind,
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoProjectShapeType,
  VideoTrackKind,
} from '../../../features/video/project/types';
import {
  addAssetClipToProject,
  addAnnotationOverlayToProject,
  addShapeOverlayToProject,
  addSubtitleOverlayToProject,
  addTextOverlayToProject,
  addVideoBlockToProject,
} from './asset-actions';

describe('annotation template-ref insertion', () => {
  registerAnnotationInsertionTests();
  registerOverlayInsertionBranchTests();
});

function registerAnnotationInsertionTests() {
  registerTemplateRefAnnotationInsertionTests();
  registerLegacyAnnotationInsertionTests();
}

function registerTemplateRefAnnotationInsertionTests() {
  it('creates annotation overlays from built-in template refs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(225);
    const project = createEmptyVideoProject('Assets');
    const template = APPLE_GLASS_ANNOTATION_PACK.templates.callout.find(
      (candidate) => candidate.id === 'crawling-arrow-card'
    );
    if (!template) {
      throw new Error('Expected Apple Glass callout template');
    }

    const result = addAnnotationOverlayToProject(project, null, 1.5, {
      packLabel: APPLE_GLASS_ANNOTATION_PACK.label,
      template,
      templateRef: {
        packId: APPLE_GLASS_ANNOTATION_PACK.packId,
        templateId: template.id,
      },
    });

    expect(result.project.clips[0]).toEqual(
      expect.objectContaining({
        name: 'Guided Arrow Card',
        templateControlValues: expect.objectContaining({ headline: 'Обратите внимание' }),
        templateRef: {
          packId: APPLE_GLASS_ANNOTATION_PACK.packId,
          templateId: 'crawling-arrow-card',
        },
        type: VideoProjectClipType.ANNOTATION,
      })
    );
  });
}

function registerLegacyAnnotationInsertionTests() {
  it('keeps legacy insertion on the preferred overlay track', () => {
    const project = createEmptyVideoProject('Assets');
    const preferredTrack = project.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY);
    if (!preferredTrack) {
      throw new Error('Expected overlay track');
    }

    const result = addAnnotationOverlayToProject(project, preferredTrack.id, 2.25);

    expect(result.selectedTrackId).toBe(preferredTrack.id);
    expect(result.project.clips[0]).toEqual(
      expect.objectContaining({
        startTime: 2.25,
        templateKind: 'LOWER_THIRD_BASIC',
        trackId: preferredTrack.id,
        type: VideoProjectClipType.ANNOTATION,
      })
    );
  });
}

function registerOverlayInsertionBranchTests() {
  it('covers the asset-action insertion branches used around annotation tracks', () => {
    const project = createEmptyVideoProject('Assets');

    expect(
      addAssetClipToProject(project, createAsset(VideoProjectAssetType.IMAGE, 'image'), null, 1)
        .project.clips[0]
    ).toEqual(expect.objectContaining({ type: VideoProjectClipType.IMAGE }));
    expect(
      addAssetClipToProject(project, createAsset(VideoProjectAssetType.AUDIO, 'audio'), null, 1)
        .project.clips[0]
    ).toEqual(expect.objectContaining({ type: VideoProjectClipType.AUDIO }));
    expect(
      addAssetClipToProject(project, createAsset(VideoProjectAssetType.VIDEO, 'video'), null, 1)
        .project.clips[0]
    ).toEqual(expect.objectContaining({ type: VideoProjectClipType.VIDEO }));
    expect(addTextOverlayToProject(project, null, 1).project.clips[0]).toEqual(
      expect.objectContaining({ type: VideoProjectClipType.TEXT })
    );
    expect(addSubtitleOverlayToProject(project, null, 1).project.clips[0]).toEqual(
      expect.objectContaining({ type: VideoProjectClipType.SUBTITLE })
    );
    expect(
      addShapeOverlayToProject(project, null, 1, VideoProjectShapeType.RECTANGLE).project.clips[0]
    ).toEqual(expect.objectContaining({ type: VideoProjectClipType.SHAPE }));
    expect(
      addVideoBlockToProject(project, VideoBlockKind.STEP_EXPLAINER, null, 1).project.clips.length
    ).toBeGreaterThan(0);
  });
}

function createAsset(type: VideoProjectAssetType, name: string) {
  return createVideoProjectAsset(
    name,
    type,
    { kind: 'project-asset', projectAssetId: `${name}-asset` },
    {
      audioPeaks: type === VideoProjectAssetType.VIDEO ? [0.1, 0.2] : null,
      duration: type === VideoProjectAssetType.IMAGE ? null : 6,
      hasAudio: type === VideoProjectAssetType.VIDEO,
      height: 1080,
      mimeType: type === VideoProjectAssetType.AUDIO ? 'audio/mp3' : 'video/mp4',
      size: 100,
      width: 1920,
    }
  );
}
