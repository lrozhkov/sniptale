// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  type VideoProject,
  type VideoProjectVideoClip,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { usePreviewStageVideoBankClips } from '../runtime/index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 4,
    duration: 6,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
    },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 2,
    sourceDuration: 6,
    ...overrides,
  };
}

function VideoBankHarness(props: {
  activeClips: VideoProjectVideoClip[];
  currentTime: number;
  onResolve: (clips: VideoProjectVideoClip[]) => void;
  project: VideoProject;
}) {
  const videoBankClips = usePreviewStageVideoBankClips(
    props.project,
    props.currentTime,
    props.activeClips
  );

  useEffect(() => {
    props.onResolve(videoBankClips as VideoProjectVideoClip[]);
  }, [props, videoBankClips]);

  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('warms nearby transition videos into the hidden preview bank before overlap starts', async () => {
  const project = createEmptyVideoProject('Warmup');
  const activeClip = createVideoClip({ id: 'clip-active', trackId: project.tracks[0]!.id });
  const nextClip = createVideoClip({
    id: 'clip-next',
    startTime: activeClip.startTime + activeClip.duration - 0.3,
    trackId: project.tracks[0]!.id,
  });
  const onResolve = vi.fn();
  project.clips = [activeClip, nextClip];

  await act(async () => {
    root?.render(
      <VideoBankHarness
        activeClips={[activeClip]}
        currentTime={nextClip.startTime - 0.2}
        onResolve={onResolve}
        project={project}
      />
    );
  });

  expect(onResolve).toHaveBeenLastCalledWith([activeClip, nextClip]);
});
