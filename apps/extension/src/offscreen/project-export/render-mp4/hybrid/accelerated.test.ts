import { expect, it } from 'vitest';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProject,
} from '../../../../features/video/project/types';
import { createAcceleratedCompositeSpan } from './accelerated';

function createProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    assets: [
      {
        id: 'asset-1',
        metadata: {
          audioPeaks: [],
          duration: 4,
          hasAudio: false,
          height: 360,
          mimeType: 'video/webm',
          size: 1,
          width: 640,
        },
        name: 'source.webm',
        source: { kind: 'recording', recordingId: 'recording-1' },
      },
    ],
    clips: [
      {
        assetId: 'asset-1',
        duration: 4,
        id: 'clip-1',
        sourceDuration: 4,
        sourceStart: 0,
        startTime: 0,
        trackId: 'track-1',
        transform: { height: 360, opacity: 1, rotation: 0, width: 640, x: 320, y: 180 },
        type: 'VIDEO',
      },
    ],
    duration: 4,
    height: 720,
    tracks: [{ id: 'track-1', visible: true }],
    width: 1280,
    ...overrides,
  } as VideoProject;
}

const settings = {
  downloadAfterExport: true,
  format: VideoExportFormat.MP4,
  fps: 30,
  height: 720,
  quality: VideoExportQualityPreset.BALANCED,
  width: 1280,
};

it('allows accelerated composite for centered WebM sources with non-matching source size', () => {
  expect(createAcceleratedCompositeSpan(createProject(), settings, 0, 4)).toEqual({
    end: 4,
    kind: 'accelerated-composite',
    reason: 'webm-frame-provider',
    start: 0,
  });
});

it('rejects accelerated composite when source decode assumptions are not met', () => {
  expect(
    createAcceleratedCompositeSpan(
      createProject({
        assets: [
          {
            ...createProject().assets[0]!,
            metadata: {
              audioPeaks: [],
              duration: 4,
              hasAudio: false,
              height: 360,
              mimeType: 'video/quicktime',
              size: 1,
              width: 640,
            },
          },
        ],
      }),
      settings,
      0,
      4
    )
  ).toBeNull();

  expect(
    createAcceleratedCompositeSpan(
      createProject({ clips: [{ ...createProject().clips[0]!, playbackRate: 1.5 }] as never }),
      settings,
      0,
      4
    )
  ).toBeNull();
});
