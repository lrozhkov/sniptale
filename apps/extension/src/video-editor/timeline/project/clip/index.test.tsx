// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectAssetType,
  VideoProjectClipType,
  type VideoProjectAudioClip,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { ProjectTimelineClip } from './index';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createClip(trackId: string): VideoProjectVideoClip {
  return {
    id: 'clip-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 1,
    duration: 3,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 80, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 3,
  };
}

function createAudioClip(trackId: string): VideoProjectAudioClip {
  const { fitMode, sourceStart, sourceDuration, ...baseClip } = createClip(trackId);
  void fitMode;
  void sourceStart;
  void sourceDuration;

  return {
    ...baseClip,
    type: VideoProjectClipType.AUDIO,
    playbackRate: 1,
    sourceStart: 0,
    sourceDuration: 3,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('stops click propagation so clip interactions do not trigger timeline seek handlers', () => {
  const project = createEmptyVideoProject('Timeline');
  const onParentClick = vi.fn();

  act(() => {
    root?.render(
      <div onClick={onParentClick}>
        <ProjectTimelineClip
          clip={createClip(project.tracks[0]!.id)}
          isHovered={false}
          isSelected={false}
          pixelsPerSecond={10}
          project={project}
          trackLocked={false}
          onClipHoverChange={vi.fn()}
          onSelectClip={vi.fn()}
          onBeginClipInteraction={vi.fn()}
        />
      </div>
    );
  });

  act(() => {
    container
      ?.querySelector('[class*="absolute"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(onParentClick).not.toHaveBeenCalled();
});

it('renders selected clip edge emphasis and fade previews', () => {
  const project = createEmptyVideoProject('Timeline');
  const clip = { ...createClip(project.tracks[0]!.id), fadeInMs: 500, fadeOutMs: 1000 };

  act(() => {
    root?.render(
      <ProjectTimelineClip
        clip={clip}
        isHovered={false}
        isSelected={true}
        pixelsPerSecond={20}
        project={project}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
      />
    );
  });

  expect(container?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  expect(container?.querySelector('[title="videoEditor.sidebar.fadeInLabel"]')).toBeTruthy();
  expect(container?.querySelector('[title="videoEditor.sidebar.fadeOutLabel"]')).toBeTruthy();
});

it('renders visual clip previews with name-only labels', () => {
  const project = createEmptyVideoProject('Timeline');

  act(() => {
    root?.render(
      <ProjectTimelineClip
        clip={createClip(project.tracks[0]!.id)}
        isHovered={false}
        isSelected={false}
        pixelsPerSecond={24}
        preview={{ kind: 'video', urls: ['blob:frame-1', 'blob:frame-2'] }}
        project={project}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
      />
    );
  });

  expect(container?.querySelectorAll('img')).toHaveLength(2);
  expect(container?.textContent).toContain('Clip 1');
  expect(container?.textContent).not.toContain('0:01');
});

it('prefers the clip name over the linked asset name inside the clip body', () => {
  const project = createEmptyVideoProject('Timeline');
  project.assets = [
    createVideoProjectAsset(
      'Asset file name',
      VideoProjectAssetType.VIDEO,
      { kind: 'project-asset', projectAssetId: 'asset-1' },
      {
        audioPeaks: null,
        duration: 3,
        hasAudio: true,
        height: 720,
        mimeType: 'video/mp4',
        size: 100,
        width: 1280,
      }
    ),
  ];

  act(() => {
    root?.render(
      <ProjectTimelineClip
        clip={createClip(project.tracks[0]!.id)}
        isHovered={false}
        isSelected={false}
        pixelsPerSecond={24}
        project={project}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
      />
    );
  });

  expect(container?.textContent).toContain('Clip 1');
  expect(container?.textContent).not.toContain('Asset file name');
});

it('grows visual clip height with tall track rows and keeps previews as fixed tiles', () => {
  const project = createEmptyVideoProject('Timeline');

  act(() => {
    root?.render(
      <ProjectTimelineClip
        clip={createClip(project.tracks[0]!.id)}
        isHovered={false}
        isSelected={false}
        pixelsPerSecond={24}
        preview={{ kind: 'video', urls: ['blob:frame-1'] }}
        project={project}
        trackClipRowHeight={124}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
      />
    );
  });

  const clip = container?.querySelector<HTMLElement>('[data-project-timeline-clip]');
  const image = container?.querySelector<HTMLImageElement>('img');

  expect(clip?.style.height).toBe('106px');
  expect(image?.className).not.toContain('flex-1');
  expect(image?.style.width).toBe('160px');
});

it('keeps audio clip labels focused on the clip name', () => {
  const project = createEmptyVideoProject('Timeline');

  act(() => {
    root?.render(
      <ProjectTimelineClip
        clip={createAudioClip(project.tracks[0]!.id)}
        isHovered={false}
        isSelected={false}
        pixelsPerSecond={24}
        project={project}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
      />
    );
  });

  expect(container?.textContent).toContain('Clip 1');
  expect(container?.textContent).not.toContain('0:01');
});
