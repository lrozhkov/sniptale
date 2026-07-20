import { describe, expect, it } from 'vitest';

import { createVideoProjectFromMultiSourceRecording } from './multi-source-recording';
import { VideoMediaFitMode, VideoProjectClipType, VideoTrackKind } from '../types/index';

function createVideoInput(
  recordingId: string,
  filename: string,
  duration: number,
  dimensions = { height: 720, width: 1280 }
) {
  return {
    recordingId,
    filename,
    width: dimensions.width,
    height: dimensions.height,
    duration,
    mimeType: 'video/webm',
    size: 1024,
  };
}

describe('multi-source recording project factory', () => {
  registerMultiSourceTrackTests();
  registerMultiSourceWebcamTests();
});

function registerMultiSourceTrackTests() {
  it('creates separate tracks and clips for window recordings plus microphone audio', () => {
    const project = createVideoProjectFromMultiSourceRecording({
      name: 'Multi window',
      videos: [
        createVideoInput('rec-1', 'window-1.webm', 12),
        createVideoInput('rec-2', 'window-2.webm', 10),
      ],
      microphoneAudio: {
        recordingId: 'mic-1',
        filename: 'microphone.webm',
        duration: 11,
        mimeType: 'audio/webm',
        size: 512,
      },
    });

    expect(project.baseRecordingId).toBe('rec-1');
    expect(project.duration).toBe(12);
    expect(project.tracks.filter((track) => track.kind === VideoTrackKind.PRIMARY)).toHaveLength(2);
    expect(project.tracks.filter((track) => track.kind === VideoTrackKind.AUDIO)).toHaveLength(1);
    expect(project.clips.map((clip) => clip.type)).toEqual([
      VideoProjectClipType.VIDEO,
      VideoProjectClipType.VIDEO,
      VideoProjectClipType.AUDIO,
    ]);
    expect(project.clips.every((clip) => clip.startTime === 0)).toBe(true);
    expect(project.assets.map((asset) => asset.name)).toEqual([
      'window-1.webm',
      'window-2.webm',
      'microphone.webm',
    ]);
    expect(project.assets.at(-1)?.source).toEqual({
      kind: 'recording',
      recordingId: 'mic-1',
    });
  });
}

function registerMultiSourceWebcamTests() {
  it('places webcam video after source videos and before microphone audio', () => {
    const project = createVideoProjectFromMultiSourceRecording({
      name: 'Multi window webcam',
      videos: [
        createVideoInput('rec-1', 'window-1.webm', 12),
        createVideoInput('rec-2', 'window-2.webm', 10),
      ],
      webcamVideo: createVideoInput('rec-webcam', 'webcam.webm', 14, {
        height: 360,
        width: 640,
      }),
      microphoneAudio: {
        recordingId: 'mic-1',
        filename: 'microphone.webm',
        duration: 13,
        mimeType: 'audio/webm',
        size: 512,
      },
    });
    const videoClips = project.clips.filter((clip) => clip.type === VideoProjectClipType.VIDEO);

    expect(project.baseRecordingId).toBe('rec-1');
    expect(project.duration).toBe(14);
    expect(project.assets.map((asset) => asset.name)).toEqual([
      'window-1.webm',
      'window-2.webm',
      'webcam.webm',
      'microphone.webm',
    ]);
    expect(project.clips.map((clip) => clip.type)).toEqual([
      VideoProjectClipType.VIDEO,
      VideoProjectClipType.VIDEO,
      VideoProjectClipType.VIDEO,
      VideoProjectClipType.AUDIO,
    ]);
    expect(videoClips[2]).toEqual(
      expect.objectContaining({
        muted: true,
        startTime: 0,
        transform: expect.objectContaining({ height: 360, width: 640, x: 0, y: 0 }),
      })
    );
  });
}

describe('multi-source recording project placement', () => {
  it('places every source clip at natural size from the top-left canvas origin', () => {
    const project = createVideoProjectFromMultiSourceRecording({
      name: 'Multi window',
      videos: [
        createVideoInput('rec-1', 'window-1.webm', 12, { height: 720, width: 1280 }),
        createVideoInput('rec-2', 'window-2.webm', 10, { height: 480, width: 640 }),
      ],
    });
    const videoClips = project.clips.filter((clip) => clip.type === VideoProjectClipType.VIDEO);

    expect(project.width).toBe(1280);
    expect(project.height).toBe(720);
    expect(videoClips.map((clip) => clip.fitMode)).toEqual([
      VideoMediaFitMode.SOURCE_100,
      VideoMediaFitMode.SOURCE_100,
    ]);
    expect(videoClips.map((clip) => clip.transform)).toEqual([
      expect.objectContaining({ height: 720, width: 1280, x: 0, y: 0 }),
      expect.objectContaining({ height: 480, width: 640, x: 0, y: 0 }),
    ]);
  });
});

describe('multi-source recording project factory edge cases', () => {
  it('creates a mic-free project using the first video as the canvas default', () => {
    const project = createVideoProjectFromMultiSourceRecording({
      name: 'No mic',
      videos: [createVideoInput('rec-1', 'window-1.webm', 5)],
    });

    expect(project.width).toBe(1280);
    expect(project.height).toBe(720);
    expect(project.tracks.filter((track) => track.kind === VideoTrackKind.AUDIO)).toHaveLength(1);
    expect(project.clips.map((clip) => clip.type)).toEqual([VideoProjectClipType.VIDEO]);
    expect(project.duration).toBe(5);
  });

  it('falls back to the default canvas when no source assets are finalized', () => {
    const project = createVideoProjectFromMultiSourceRecording({
      name: 'Empty',
      videos: [],
    });

    expect(project.width).toBe(1920);
    expect(project.height).toBe(1080);
    expect(project.duration).toBe(0.1);
    expect(project.clips).toHaveLength(0);
  });
});
