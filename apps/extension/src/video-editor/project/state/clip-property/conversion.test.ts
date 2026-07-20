import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoOverlayTemplateKind,
  VideoProjectClipType,
  VideoTrackKind,
} from '../../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';

function createConversionStore() {
  return createVideoEditorProjectTestStore();
}

it('converts text clips into annotation templates through the dedicated conversion seam', () => {
  const store = createConversionStore();
  const project = createEmptyVideoProject('Conversion seam');
  const overlayTrackId = project.tracks.find((track) => track.kind === 'OVERLAY')?.id ?? 'overlay';

  store.getState().setProject(project);
  const textClipId = store.getState().addTextOverlay(overlayTrackId, 0.5);
  store.getState().addAnnotationOverlay(overlayTrackId, 1.25);
  store.getState().convertTextClipToAnnotation(textClipId!, VideoOverlayTemplateKind.TITLE_REVEAL);

  const clip = store.getState().project?.clips.find((item) => item.id === textClipId);
  expect(clip).toEqual(
    expect.objectContaining({
      id: textClipId,
      templateKind: VideoOverlayTemplateKind.TITLE_REVEAL,
      type: VideoProjectClipType.ANNOTATION,
    })
  );
});

it('leaves text clips unchanged when their track is locked', () => {
  const store = createConversionStore();
  const project = createEmptyVideoProject('Locked conversion seam');
  const overlayTrackId =
    project.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY)?.id ?? 'overlay';

  store.getState().setProject(project);
  const textClipId = store.getState().addTextOverlay(overlayTrackId, 0.5);
  store.getState().toggleTrackLock(overlayTrackId);
  store
    .getState()
    .convertTextClipToAnnotation(textClipId!, VideoOverlayTemplateKind.LOWER_THIRD_ACCENT);

  const clip = store.getState().project?.clips.find((item) => item.id === textClipId);
  expect(clip?.type).toBe(VideoProjectClipType.TEXT);
});

it('keeps non-text clip targets as a clip-level no-op', () => {
  const store = createConversionStore();
  const project = createEmptyVideoProject('Guarded conversion seam');
  const overlayTrackId =
    project.tracks.find((track) => track.kind === VideoTrackKind.OVERLAY)?.id ?? 'overlay';

  store.getState().setProject(project);
  const annotationClipId = store
    .getState()
    .addAnnotationOverlay(overlayTrackId, 1, VideoOverlayTemplateKind.CALLOUT_CARD);
  const beforeClip = store.getState().project?.clips.find((item) => item.id === annotationClipId);

  store
    .getState()
    .convertTextClipToAnnotation(annotationClipId!, VideoOverlayTemplateKind.LOWER_THIRD_BADGE);

  expect(store.getState().project?.clips.find((item) => item.id === annotationClipId)).toEqual(
    beforeClip
  );
});
