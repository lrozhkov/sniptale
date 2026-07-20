// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { createVideoProject } from '../../../project/test-support/fixtures';
import { renderPreviewClip } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const reactActEnvGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 5,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip 1',
    sourceDuration: 5,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-1',
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      height: 100,
      opacity: 1,
      rotation: 0,
      width: 100,
      x: 0,
      y: 0,
    },
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    ...overrides,
  };
}

function PreviewClipHarness(props: {
  clip: VideoProjectVideoClip;
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement | null>>;
}) {
  return (
    <>
      {renderPreviewClip({
        assetUrls: { 'asset-1': 'blob:asset-1' },
        clip: props.clip,
        currentTime: 0,
        onBeginInteraction: () => undefined,
        project: createVideoProject({ height: 100, width: 100 }),
        selectedClipId: props.clip.id,
        videoRefs: props.videoRefs,
      })}
    </>
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  reactActEnvGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  delete reactActEnvGlobal.IS_REACT_ACT_ENVIRONMENT;
});

it('removes stale video refs when a preview clip unmounts', async () => {
  const videoRefs = {
    current: {} as Record<string, HTMLVideoElement | null>,
  };
  const clip = createVideoClip();

  await act(async () => {
    root?.render(<PreviewClipHarness clip={clip} videoRefs={videoRefs} />);
  });

  expect(videoRefs.current[clip.id]).toBeInstanceOf(HTMLVideoElement);

  await act(async () => {
    root?.render(<></>);
  });

  expect(clip.id in videoRefs.current).toBe(false);
});
