import { expect, it } from 'vitest';
import {
  VideoMediaFitMode,
  VideoOverlayTemplateKind,
  VideoProjectClipType,
  VideoProjectShapeType,
} from '../../../../features/video/project/types';
import { createProjectWithMediaTrack, getAnnotationClipId } from './content.test-support';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';
import type { VideoEditorProjectState } from '../contracts';

function createContentStore() {
  return createVideoEditorProjectTestStore();
}

function expectAnnotationMutationResult(
  store: ReturnType<typeof createContentStore>,
  annotationClipId: string
): void {
  const clip = store.getState().project?.clips.find((item) => item.id === annotationClipId);
  expect(clip).toEqual(
    expect.objectContaining({
      calloutDecor: expect.objectContaining({
        markerKind: 'RING',
      }),
      direction: 'DOWN',
      introAnimation: 'SHIMMER_ENTRY',
      introDurationMs: 0,
      leaderLine: expect.objectContaining({
        length: 7680,
        style: 'ELBOW',
        thickness: 1,
      }),
      outroDurationMs: 5000,
      target: 'POINT',
      targetPoint: { x: 0, y: 7680 },
      style: expect.objectContaining({
        accentColor: '#101010',
        badgeTextColor: '#222222',
        borderRadius: 64,
        depthAmount: 0,
        headlineColor: '#f8f8f8',
        padding: 80,
        shimmerAmount: 1,
        sublineColor: '#cfcfcf',
      }),
      type: VideoProjectClipType.ANNOTATION,
    })
  );
  expect(clip && 'content' in clip ? clip.content.headline : null).toBe('Updated title');
  expect(clip && 'content' in clip ? clip.content.subline : null).toBe('Generated subline');
  expect(clip && 'templateControlValues' in clip ? clip.templateControlValues : null).toEqual({
    headline: 'Generated headline',
  });
  expect(clip && 'templateRef' in clip ? clip.templateRef : null).toEqual({
    packId: 'custom.pack',
    templateId: 'custom-title',
  });
}

it('updates fit mode and clamps fit scale percent for media clips', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());

  store.getState().updateMediaClipFitMode('clip-video', VideoMediaFitMode.COVER);
  store.getState().updateMediaClipFitScalePercent('clip-video', 80);
  store.getState().updateMediaClipFitScalePercent('clip-video', 999);
  store.getState().updateMediaClipFitScalePercent('clip-video', Number.NaN);
  store.getState().updateMediaClipFitScalePercent('clip-video', -5);

  const clip = store.getState().project?.clips.find((item) => item.id === 'clip-video');
  expect(clip).toEqual(
    expect.objectContaining({
      fitMode: VideoMediaFitMode.COVER,
      fitScalePercent: 10,
    })
  );
  expect(clip?.transform.width).toBe(192);
});

it('updates textual content and style through the split text style owner', () => {
  const store = createContentStore();
  const project = createProjectWithMediaTrack();
  store.getState().setProject(project);
  const shapeClipId = store
    .getState()
    .addShapeOverlay(VideoProjectShapeType.RECTANGLE, project.tracks[2]!.id, 0);

  store.getState().updateTextClipContent('clip-text', 'Updated text');
  store.getState().updateTextClipStyle('clip-text', {
    borderWidth: 99,
    fontSize: 999,
    fontWeight: 5,
    lineHeight: 10,
    padding: Number.NaN,
  });
  store.getState().updateTextClipStyle('clip-text', { fontSize: Number.NaN });
  store.getState().updateShapeClipStyle(shapeClipId!, {
    borderRadius: -5,
    fillColor: '#abcdef',
    strokeWidth: 999,
  });

  const textClip = store.getState().project?.clips.find((item) => item.id === 'clip-text');
  const shapeClip = store.getState().project?.clips.find((item) => item.id === shapeClipId);

  expect(textClip).toEqual(
    expect.objectContaining({
      text: 'Updated text',
      style: expect.objectContaining({
        borderWidth: 32,
        fontSize: 160,
        fontWeight: 100,
        lineHeight: 2.4,
        padding: 0,
      }),
    })
  );
  expect(shapeClip).toEqual(
    expect.objectContaining({
      style: expect.objectContaining({ borderRadius: 0, fillColor: '#abcdef', strokeWidth: 32 }),
    })
  );
});

it('updates annotation content, style, and template fields through the shared clip property seam', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());
  const annotationClipId = getAnnotationClipId(store.getState().project);

  store.getState().updateAnnotationClipContent(annotationClipId, { headline: 'Updated title' });
  store.getState().updateAnnotationClipStyle(annotationClipId, {
    accentColor: '#ffaa00',
    badgeTextColor: '#222222',
    blurAmount: Number.NaN,
    borderRadius: 999,
    depthAmount: -1,
    headlineColor: '#f8f8f8',
    padding: 999,
    shimmerAmount: 9,
    sublineColor: '#cfcfcf',
  });
  store.getState().updateAnnotationClipTemplate(annotationClipId, {
    calloutDecor: { markerKind: 'RING' },
    content: { subline: 'Generated subline' },
    direction: 'DOWN',
    introAnimation: 'SHIMMER_ENTRY',
    introDurationMs: -100,
    leaderLine: { length: 999999, style: 'ELBOW', thickness: 0 },
    outroDurationMs: 999999,
    style: { accentColor: '#101010' },
    target: 'POINT',
    targetPoint: { x: -30, y: 999999 },
    templateControlValues: { headline: 'Generated headline' },
    templateRef: { packId: 'custom.pack', templateId: 'custom-title' },
    templateSnapshot: {
      capturedAtSchemaVersion: 1,
      controls: { headline: 'Generated headline' },
      templateRef: { packId: 'custom.pack', templateId: 'custom-title' },
    },
  });
  expectAnnotationMutationResult(store, annotationClipId);
});

it('reapplies annotation template defaults when the template kind changes', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());
  const annotationClipId = getAnnotationClipId(store.getState().project);

  store.getState().updateAnnotationClipContent(annotationClipId, { headline: 'Pinned callout' });
  store.getState().updateAnnotationClipTemplate(annotationClipId, {
    templateKind: VideoOverlayTemplateKind.CALLOUT_CARD,
  });

  const clip = store.getState().project?.clips.find((item) => item.id === annotationClipId);
  expect(clip).toEqual(
    expect.objectContaining({
      direction: 'RIGHT',
      introAnimation: 'CONNECTOR_DRAW',
      motionFamily: 'FRAME_TRACE',
      renderFamily: 'FRAME',
      target: 'RECT',
      templateKind: VideoOverlayTemplateKind.CALLOUT_CARD,
      type: VideoProjectClipType.ANNOTATION,
    })
  );
  expect(clip?.transform.y).toBeLessThan(200);
  expect(clip && 'content' in clip ? clip.content.headline : null).toBe('Pinned callout');
});

it('supports style swaps that preserve placement, target, and timing overrides', () => {
  const store = createContentStore();
  store.getState().setProject(createProjectWithMediaTrack());
  const annotationClipId = getAnnotationClipId(store.getState().project);

  store.getState().updateAnnotationClipTemplate(annotationClipId, {
    target: 'POINT',
    targetPoint: { x: 320, y: 180 },
  });
  store.getState().updateAnnotationClipTemplate(annotationClipId, {
    direction: 'DOWN',
    introDurationMs: 180,
    outroDurationMs: 640,
  });

  const beforeSwap = store
    .getState()
    .project?.clips.find((item) => item.id === annotationClipId) as
    | Extract<
        NonNullable<VideoEditorProjectState['project']>['clips'][number],
        { type: 'ANNOTATION' }
      >
    | undefined;

  store.getState().updateAnnotationClipTemplate(annotationClipId, {
    preservePlacementOnTemplateChange: true,
    templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
  });

  const clip = store.getState().project?.clips.find((item) => item.id === annotationClipId);
  expect(clip).toEqual(
    expect.objectContaining({
      direction: 'DOWN',
      introDurationMs: 180,
      outroDurationMs: 640,
      target: 'POINT',
      targetPoint: { x: 320, y: 180 },
      templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
      transform: beforeSwap?.transform,
      type: VideoProjectClipType.ANNOTATION,
    })
  );
});
