import { describe, expect, it } from 'vitest';
import { convertTextClipToAnnotationClip } from './annotation/conversion';
import { createAnnotationClip, createTextClip } from './factories/overlay-clip';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
  getDefaultTrackName,
} from './factories/creation';
import { getSortedTracks, isAnnotationClip } from './timeline';
import { getVideoProjectUtilityLanes } from './utility-lanes';
import { isLegacyScrollActionEvent, mapSourceRangeToProjectSpans } from './timeline/source-time';
import { resolveAnnotationPresentation } from './annotation/template';
import {
  VideoOverlayTemplateKind,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectClipType,
  VideoTrackKind,
} from './types/index';

function verifyPublicFacadeSourceTimeExports() {
  const project = createEmptyVideoProject('Facade');
  const [primaryTrack] = project.tracks;
  const sortedTracks = getSortedTracks(project);

  expect(getDefaultTrackName(VideoTrackKind.PRIMARY, 2)).toContain('2');
  expect(
    mapSourceRangeToProjectSpans(
      [
        {
          duration: 2,
          id: 'clip-1',
          playbackRate: 2,
          sourceDuration: 4,
          sourceStart: 1,
          startTime: 3,
        },
      ],
      2,
      4
    )
  ).toEqual([
    {
      clipId: 'clip-1',
      endTime: 4.5,
      sourceEnd: 4,
      sourceStart: 2,
      startTime: 3.5,
    },
  ]);
  expect(
    isLegacyScrollActionEvent({
      kind: VideoProjectActionEventKind.SCROLL,
      preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
    })
  ).toBe(true);
  expect(primaryTrack?.kind).toBe(VideoTrackKind.PRIMARY);
  expect(sortedTracks.map((track) => track.kind)).toEqual([
    VideoTrackKind.OVERLAY,
    VideoTrackKind.PRIMARY,
    VideoTrackKind.AUDIO,
  ]);
  expect(getVideoProjectUtilityLanes(project)).toEqual({
    actions: { visible: true, locked: false },
    camera: { visible: true, locked: false },
  });
}

function verifyRecordingFacadeDefaults() {
  const project = createVideoProjectFromRecording({
    recordingId: 'rec-1',
    filename: 'demo.webm',
    width: 1280,
    height: 720,
    duration: 6,
    mimeType: 'video/webm',
    size: 512,
    hasAudio: true,
  });

  expect(project.baseRecordingId).toBe('rec-1');
  expect(project.source).toEqual({
    kind: 'recording',
    recordingId: 'rec-1',
  });
  expect(project.clips.map((clip) => clip.type)).toEqual(['VIDEO', 'AUDIO']);
}

function verifyRecordingSidecarVideos() {
  const project = createVideoProjectFromRecording({
    recordingId: 'rec-1',
    filename: 'demo.webm',
    width: 1280,
    height: 720,
    duration: 6,
    mimeType: 'video/webm',
    size: 512,
    hasAudio: true,
    sidecarVideos: [
      {
        recordingId: 'rec-1-webcam',
        filename: 'webcam.webm',
        width: 640,
        height: 360,
        duration: 8,
        mimeType: 'video/webm',
        size: 256,
      },
    ],
  });
  const videoClips = project.clips.filter((clip) => clip.type === VideoProjectClipType.VIDEO);

  expect(project.baseRecordingId).toBe('rec-1');
  expect(project.duration).toBe(8);
  expect(project.assets.map((asset) => asset.name)).toEqual(['demo.webm', 'webcam.webm']);
  expect(project.clips.map((clip) => clip.type)).toEqual(['VIDEO', 'AUDIO', 'VIDEO']);
  expect(videoClips[1]).toEqual(
    expect.objectContaining({
      muted: true,
      startTime: 0,
      transform: expect.objectContaining({ height: 360, width: 640, x: 0, y: 0 }),
    })
  );
}

function verifyAnnotationFacadeExports() {
  const project = createEmptyVideoProject('Templates');
  const annotationClip = createAnnotationClip(project.tracks[2]!.id, 1280, 720, 1);
  const textClip = createTextClip(project.tracks[2]!.id, 1280, 720, 2);

  expect(isAnnotationClip(annotationClip)).toBe(true);
  expect(resolveAnnotationPresentation(project, annotationClip, 1.25)).toEqual(
    expect.objectContaining({
      frame: expect.objectContaining({ width: annotationClip.transform.width }),
      style: expect.objectContaining({ accentColor: expect.any(String) }),
    })
  );
  expect(
    convertTextClipToAnnotationClip(project, textClip, VideoOverlayTemplateKind.LOWER_THIRD_ACCENT)
      .type
  ).toBe('ANNOTATION');
}

describe('video-project public facade', () => {
  it(
    'exports source-time helpers and shared track labels through the public facade',
    verifyPublicFacadeSourceTimeExports
  );
  it(
    'keeps recording-backed project defaults aligned through the facade',
    verifyRecordingFacadeDefaults
  );
  it('adds recording sidecar videos as separate muted tracks', verifyRecordingSidecarVideos);
  it(
    'exports annotation template helpers through the public facade',
    verifyAnnotationFacadeExports
  );
});
