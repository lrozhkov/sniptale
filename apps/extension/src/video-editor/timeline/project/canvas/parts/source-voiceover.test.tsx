// @vitest-environment jsdom
import { MAX_TIMELINE_PIXELS_PER_SECOND } from '../../../../contracts/timeline-scale';
import { isExportReadyVideoProject } from '../../../../../features/video/project/validation/root';
import { act, useRef } from 'react';
import { useVideoEditorStore } from '../../../../state/store';
import { useTimelineNavigation } from '../../interaction-state/navigation';
import { projectSourceVoiceoverViews } from '../../../../../features/video/project/source-voiceover-views';
import { getProjectAudioWaveformPeaks } from '../../../../../features/video/project/timeline/audio';
import { buildAudioClipWaveformPath } from '../render-data';
vi.mock('../../../../../features/video/project/source-voiceover-views', async (original) => {
  const actual =
    await original<typeof import('../../../../../features/video/project/source-voiceover-views')>();
  return { ...actual, projectSourceVoiceoverViews: vi.fn(actual.projectSourceVoiceoverViews) };
});
vi.mock('../../../../../features/video/project/timeline/audio', async (original) => {
  const actual =
    await original<typeof import('../../../../../features/video/project/timeline/audio')>();
  return { ...actual, getProjectAudioWaveformPeaks: vi.fn(actual.getProjectAudioWaveformPeaks) };
});
vi.mock('../render-data', async (original) => {
  const actual = await original<typeof import('../render-data')>();
  return { ...actual, buildAudioClipWaveformPath: vi.fn(actual.buildAudioClipWaveformPath) };
});
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { buildReviewTimeMap } from '../../../../../features/video/review/timeline';
import { anchorReviewVoiceoverAtSource } from '../../../../../features/video/review/voiceover-edits';
import { splitProjectClipsAtTime } from '../../../../project/state/clip-timeline/split';
import { createTimelineProjection } from '../../interaction-state/projection';
import { ProjectTimelineSourceVoiceoverViews } from './source-voiceover';

const callbacks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../../../../runtime/controller/composition/hooks', async () => {
  const { useVideoEditorPlaybackPort } = await import('../../../../runtime/controller/store');
  return {
    useVideoEditorTimelineController: () => {
      useVideoEditorPlaybackPort((port) => port);
      return { actions: { onSelectSourceVoiceover: callbacks.select } };
    },
  };
});

function fixture() {
  let project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'Source.webm',
    width: 640,
    height: 360,
    duration: 8,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
  });
  const source = project.clips.find((clip) => clip.type === 'VIDEO')!;
  if (source.type !== 'VIDEO') throw new Error('Missing video');
  const track = createVideoProjectTrack('Voice', 1, 'AUDIO');
  const audio = createVideoProjectAsset(
    'Voice take',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'take' },
    {
      width: 0,
      height: 0,
      duration: 8,
      mimeType: 'audio/wav',
      size: 100,
      hasAudio: true,
      audioPeaks: [0.1, 0.2, 0.8, 0.5],
    }
  );
  const reference = buildReviewTimeMap(8, []);
  project.tracks.push(track);
  project.assets.push(audio);
  project.version = 31;
  project.sourceVoiceoverDocuments = [
    {
      id: 'document',
      trackId: track.id,
      enabled: true,
      binding: {
        kind: 'source',
        assetId: source.assetId,
        sourceInstanceId: source.sourceInstanceId ?? source.id,
      },
      reference,
      take: anchorReviewVoiceoverAtSource(
        {
          id: 'take',
          assetId: audio.id,
          timelineStart: 0,
          sourceOffset: 0.37,
          duration: 4,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
        reference
      ),
    },
  ];
  project = splitProjectClipsAtTime(project, source.id, 2);
  return { project, track };
}

it('selects the whole document from either split view without pointer fallthrough or saved clip mutations', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  callbacks.select.mockClear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const { project, track } = fixture();
  const before = structuredClone(project);
  const background = vi.fn();
  try {
    act(() =>
      root.render(
        <div onPointerDown={background}>
          <ProjectTimelineSourceVoiceoverViews
            project={project}
            trackId={track.id}
            selection={{ kind: 'source-voiceover', documentId: 'document' }}
            pixelsPerSecond={100}
            height={48}
          />
        </div>
      )
    );
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-source-voiceover-view]')];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    expect(host.querySelector('[data-project-timeline-clip]')).toBeNull();
    for (const button of buttons)
      act(() => {
        button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        button.click();
      });
    expect(background).not.toHaveBeenCalled();
    expect(callbacks.select.mock.calls).toEqual([['document'], ['document']]);
    expect(project).toEqual(before);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('keeps muted disabled and hidden occurrences selectable and bounds geometry to the viewport', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const { project, track } = fixture();
  const doc = project.sourceVoiceoverDocuments![0]!;
  doc.enabled = false;
  doc.take.muted = true;
  project.tracks.find((item) => item.kind === 'PRIMARY')!.visible = false;
  for (const clip of project.clips) clip.startTime += 43200;
  project.duration = 43208;
  expect(isExportReadyVideoProject(project)).toBe(true);
  const projection = createTimelineProjection({
    extentSeconds: 43208,
    startTime: 43200,
    pixelsPerSecond: MAX_TIMELINE_PIXELS_PER_SECOND,
    viewportWidth: 960,
  });
  try {
    act(() =>
      root.render(
        <ProjectTimelineSourceVoiceoverViews
          project={project}
          trackId={track.id}
          selection={{ kind: 'scene' }}
          pixelsPerSecond={MAX_TIMELINE_PIXELS_PER_SECOND}
          projection={projection}
          height={48}
        />
      )
    );
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-source-voiceover-view]')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.disabled).toBe(false);
    expect(buttons[0]!.getAttribute('data-source-voiceover-inactive')).toBe('true');
    expect(parseFloat(buttons[0]!.style.left)).toBeGreaterThanOrEqual(-121);
    expect(parseFloat(buttons[0]!.style.width)).toBeLessThanOrEqual(1201);
    doc.take.dormant = true;
    act(() =>
      root.render(
        <ProjectTimelineSourceVoiceoverViews
          project={project}
          trackId={track.id}
          selection={{ kind: 'scene' }}
          pixelsPerSecond={100}
          height={48}
        />
      )
    );
    expect(host.querySelector('[data-source-voiceover-view]')).toBeNull();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('retains source voiceover placement, peaks and path across real store clock updates', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { project, track } = fixture();
  const prior = useVideoEditorStore.getState();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let renderedProject = project;
  let selected = false;
  const previousSelect = callbacks.select;
  let navigation!: ReturnType<typeof useTimelineNavigation>;
  function Clock({ zoom = 100 }: { zoom?: number }) {
    const time = useVideoEditorStore((state) => state.currentTime);
    const timelineRef = useRef<HTMLDivElement | null>(null);
    navigation = useTimelineNavigation({
      timelineRef,
      extentSeconds: 20,
      pixelsPerSecond: zoom,
      viewportWidth: 400,
    });
    return (
      <div ref={timelineRef} data-clock={time}>
        <ProjectTimelineSourceVoiceoverViews
          project={renderedProject}
          trackId={track.id}
          selection={
            selected ? { kind: 'source-voiceover', documentId: 'document' } : { kind: 'scene' }
          }
          pixelsPerSecond={zoom}
          projection={navigation.projection}
          height={48}
        />
      </div>
    );
  }
  try {
    act(() => useVideoEditorStore.getState().setProject(project));
    act(() => root.render(<Clock />));
    expect(host.querySelector('path[fill="currentColor"]')).not.toBeNull();
    vi.mocked(projectSourceVoiceoverViews).mockClear();
    vi.mocked(getProjectAudioWaveformPeaks).mockClear();
    vi.mocked(buildAudioClipWaveformPath).mockClear();
    for (const time of [0.1, 0.2, 0.3])
      act(() => useVideoEditorStore.getState().setCurrentTime(time));
    expect(host.firstElementChild?.getAttribute('data-clock')).toBe('0.3');
    expect.soft(projectSourceVoiceoverViews).not.toHaveBeenCalled();
    expect.soft(getProjectAudioWaveformPeaks).not.toHaveBeenCalled();
    expect(buildAudioClipWaveformPath).not.toHaveBeenCalled();
    callbacks.select = vi.fn();
    act(() => useVideoEditorStore.getState().setCurrentTime(0.4));
    act(() => host.querySelector<HTMLButtonElement>('[data-source-voiceover-view]')?.click());
    expect(callbacks.select).toHaveBeenCalledExactlyOnceWith('document');
    selected = true;
    act(() => root.render(<Clock />));
    expect(host.querySelector('[data-source-voiceover-view]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(getProjectAudioWaveformPeaks).not.toHaveBeenCalled();
    act(() => root.render(<Clock zoom={200} />));
    expect(getProjectAudioWaveformPeaks).toHaveBeenCalled();
    act(() => navigation.navigateTo(10));
    expect(host.querySelector('[data-source-voiceover-view]')).toBeNull();
    act(() => navigation.navigateTo(0));
    expect(host.querySelector('[data-source-voiceover-view]')).not.toBeNull();
    const documents = project.sourceVoiceoverDocuments;
    if (!documents) throw new Error('Missing fixture voiceover');
    renderedProject = {
      ...project,
      sourceVoiceoverDocuments: documents.map((document) => ({
        ...document,
        take: { ...document.take, muted: true },
      })),
    };
    act(() => root.render(<Clock zoom={200} />));
    expect(projectSourceVoiceoverViews).toHaveBeenCalled();
    expect(
      host
        .querySelector('[data-source-voiceover-view]')
        ?.getAttribute('data-source-voiceover-inactive')
    ).toBe('true');
  } finally {
    callbacks.select = previousSelect;
    act(() => root.unmount());
    act(() => useVideoEditorStore.setState(prior, true));
    host.remove();
    vi.unstubAllGlobals();
  }
});
