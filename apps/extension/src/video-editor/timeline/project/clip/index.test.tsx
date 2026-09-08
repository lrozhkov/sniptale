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

  expect(container?.querySelector('span[aria-hidden="true"].left-0')).toBeTruthy();
  expect(container?.querySelector('span[aria-hidden="true"].right-0')).toBeTruthy();
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
        preview={{
          kind: 'video',
          frames: [
            { url: 'blob:frame-1', sourceStart: 0, sourceEnd: 1.5 },
            { url: 'blob:frame-2', sourceStart: 1.5, sourceEnd: 3 },
          ],
        }}
        project={project}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
      />
    );
  });

  expect(container?.querySelectorAll('[data-timeline-frame-source]')).toHaveLength(2);
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

it.each([124, 186])('preserves thumbnail aspect in a %ipx tall track', (rowHeight) => {
  const project = createEmptyVideoProject('Timeline');

  act(() => {
    root?.render(
      <ProjectTimelineClip
        clip={createClip(project.tracks[0]!.id)}
        isHovered={false}
        isSelected={false}
        pixelsPerSecond={24}
        preview={{ kind: 'video', frames: [{ url: 'blob:frame-1', sourceStart: 0, sourceEnd: 3 }] }}
        project={project}
        trackClipRowHeight={rowHeight}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
      />
    );
  });

  const clip = container?.querySelector<HTMLElement>('[data-project-timeline-clip]');
  const image = container?.querySelector<HTMLElement>('[data-timeline-frame-source]');

  expect(clip?.style.height).toBe(`${rowHeight - 18}px`);
  expect(image?.className).not.toContain('flex-1');
  expect(image?.style.backgroundSize).toBe('auto 100%');
  expect(image?.className).toContain('bg-repeat-x');
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

it.each([false, true])(
  'routes an edge gesture only to trim and respects locked=%s',
  (trackLocked) => {
    const project = createEmptyVideoProject('Edge hit');
    const onBeginClipInteraction = vi.fn();
    const onSelectClip = vi.fn();
    act(() =>
      root?.render(
        <ProjectTimelineClip
          clip={createClip(project.tracks[0]!.id)}
          isHovered={false}
          isSelected={true}
          pixelsPerSecond={10}
          project={project}
          trackLocked={trackLocked}
          onClipHoverChange={vi.fn()}
          onSelectClip={onSelectClip}
          onBeginClipInteraction={onBeginClipInteraction}
        />
      )
    );
    const handle = container!.querySelector('button')!;
    act(() => handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(onBeginClipInteraction).toHaveBeenCalledTimes(trackLocked ? 0 : 1);
    if (!trackLocked) {
      expect(onBeginClipInteraction.mock.calls[0]?.[2]).toBe('trim-start');
      expect(onSelectClip).toHaveBeenCalledWith('clip-1');
      expect(onSelectClip.mock.invocationCallOrder[0]).toBeLessThan(
        onBeginClipInteraction.mock.invocationCallOrder[0]!
      );
    }
  }
);

it('places a loaded filmstrip interval at its source time after trim and rate changes', () => {
  const project = createEmptyVideoProject('Temporal filmstrip');
  const clip = {
    ...createClip(project.tracks[0]!.id),
    sourceStart: 2,
    sourceDuration: 8,
    duration: 4,
    playbackRate: 2,
  };
  act(() =>
    root?.render(
      <ProjectTimelineClip
        clip={clip}
        project={project}
        isHovered={false}
        isSelected={false}
        pixelsPerSecond={100}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
        preview={{ kind: 'video', frames: [{ url: 'blob:frame', sourceStart: 6, sourceEnd: 8 }] }}
      />
    )
  );
  const frame = container?.querySelector<HTMLElement>('[data-timeline-frame-source="6"]');
  expect(frame).not.toBeNull();
  expect(Number.parseFloat(frame?.style.left ?? '0')).toBeCloseTo(640 / 3);
  expect(Number.parseFloat(frame?.style.width ?? '0')).toBeCloseTo(128);
});

it('uses complete thumbnail cells rather than narrow frame slices on the tallest track', () => {
  const project = createEmptyVideoProject('Tall filmstrip');
  act(() =>
    root?.render(
      <ProjectTimelineClip
        clip={createClip(project.tracks[0]!.id)}
        project={project}
        isHovered={false}
        isSelected={false}
        pixelsPerSecond={100}
        trackClipRowHeight={186}
        trackLocked={false}
        onClipHoverChange={vi.fn()}
        onSelectClip={vi.fn()}
        onBeginClipInteraction={vi.fn()}
        preview={{
          kind: 'video',
          frames: [
            { url: 'blob:first', sourceStart: 0, sourceEnd: 1.5 },
            { url: 'blob:second', sourceStart: 1.5, sourceEnd: 3 },
          ],
        }}
      />
    )
  );
  const frame = container?.querySelector<HTMLElement>('[data-timeline-frame-source="0"]');
  expect(Number.parseFloat(frame?.style.width ?? '0')).toBeCloseTo((148 * 16) / 9);
});

it.each(['ctrlKey', 'metaKey', 'shiftKey'] as const)(
  'selects at the trim edge with %s without starting a trim',
  (modifier) => {
    const project = createEmptyVideoProject('Timeline');
    const onSelectClip = vi.fn();
    const onBeginClipInteraction = vi.fn();
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
          onSelectClip={onSelectClip}
          onBeginClipInteraction={onBeginClipInteraction}
        />
      );
    });
    const edge = container?.querySelector('button');
    expect(edge).toBeTruthy();
    act(() => {
      edge?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, [modifier]: true }));
      edge?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, [modifier]: true }));
    });
    expect(onSelectClip).toHaveBeenCalledExactlyOnceWith(
      'clip-1',
      modifier === 'shiftKey' ? 'range' : 'toggle'
    );
    expect(onBeginClipInteraction).not.toHaveBeenCalled();
  }
);
