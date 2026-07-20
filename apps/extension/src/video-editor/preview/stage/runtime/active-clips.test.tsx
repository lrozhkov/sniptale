// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { getSortedTracks } from '../../../../features/video/project/timeline';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { useActivePreviewClips } from './index';

function createVideoClip(overrides: Partial<VideoProjectVideoClip>): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip 1',
    sourceDuration: 6,
    sourceStart: 2,
    startTime: 0,
    trackId: 'track-1',
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
    transform: {
      height: 100,
      opacity: 1,
      rotation: 0,
      width: 100,
      x: 0,
      y: 0,
    },
    ...overrides,
  };
}

function ActivePreviewClipsHarness(props: {
  onReady: (clipIds: string[]) => void;
  project: VideoProject;
}) {
  props.onReady(useActivePreviewClips(props.project, 1).map((clip) => clip.id));
  return null;
}

let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
});

it('orders active preview clips from lower tracks to upper tracks', () => {
  const project = createEmptyVideoProject('Preview clip priority');
  const sortedTracks = getSortedTracks(project);
  const upperTrackId = sortedTracks[0]!.id;
  const lowerTrackId = sortedTracks[1]!.id;
  const onReady = vi.fn();

  project.clips = [
    createVideoClip({ id: 'upper-clip', trackId: upperTrackId }),
    createVideoClip({ id: 'lower-clip', trackId: lowerTrackId }),
  ] as never;

  act(() => {
    root = createRoot(document.createElement('div'));
    root.render(<ActivePreviewClipsHarness project={project} onReady={onReady} />);
  });

  expect(onReady).toHaveBeenCalledWith(['lower-clip', 'upper-clip']);
});
