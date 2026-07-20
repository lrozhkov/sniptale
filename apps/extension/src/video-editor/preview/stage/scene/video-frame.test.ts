import { expect, it } from 'vitest';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { canRenderActivePreviewVideos } from './video-frame';

function createVideoClip(): VideoProjectVideoClip {
  return {
    assetId: 'asset-video',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-video',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Video',
    sourceDuration: 6,
    sourceStart: 1,
    startTime: 3,
    trackId: 'track-video',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

it('freezes the last rendered frame while an active preview video is not ready', () => {
  const clip = createVideoClip();

  expect(
    canRenderActivePreviewVideos([clip], {
      current: {
        [clip.id]: {
          currentTime: 0,
          readyState: 1,
        } as HTMLVideoElement,
      },
    })
  ).toBe(false);
});

it('allows redraw once every active preview video has current frame data', () => {
  const clip = createVideoClip();

  expect(
    canRenderActivePreviewVideos([clip], {
      current: {
        [clip.id]: {
          currentTime: 4,
          readyState: 2,
        } as HTMLVideoElement,
      },
    })
  ).toBe(true);
});
