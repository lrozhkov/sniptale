import { buildReviewTimeMap } from '../../../../features/video/review/timeline';
import { projectSourceVoiceoverViews } from '../../../../features/video/project/source-voiceover-views';
import type { TimelineRevealRequest } from '../types';
// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { useTimelineReveal, useTimelineNoteReveal } from './reveal';
let root: Root;
let container: HTMLDivElement;
let pending: FrameRequestCallback | null;
const navigateTo = vi.fn();
const request = { kind: 'clip' as const, clipId: 'far', serial: 1 };
function Harness({ command = request }: { command?: typeof request }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const trackListRef = useRef<HTMLDivElement>(null);
  const project = createEmptyVideoProject();
  const clip = createVideoClipFromAsset(
    project.tracks[0]!.id,
    createVideoProjectAsset(
      'Far',
      'VIDEO',
      { kind: 'project-asset', projectAssetId: 'source' },
      {
        width: 640,
        height: 360,
        duration: 4,
        size: 1,
        mimeType: 'video/webm',
        hasAudio: false,
        audioPeaks: null,
      }
    ),
    640,
    360,
    80
  );
  project.clips = [{ ...clip, id: 'far', duration: 4 }];
  useTimelineReveal({
    request: command,
    project,
    pixelsPerSecond: 100,
    viewportWidth: 1000,
    navigateTo,
    timelineRef,
    trackListRef,
  });
  return (
    <>
      <div ref={timelineRef}>
        <div data-project-timeline-clip="far" />
      </div>
      <div ref={trackListRef} />
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('CSS', { escape: (s: string) => s.replace(/["\\]/g, '\\$&') });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn(() => {
      pending = null;
    })
  );
  navigateTo.mockClear();
  pending = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('centers a far clip then synchronizes the vertical rail after it is rendered', () => {
  act(() => root.render(<Harness />));
  expect(navigateTo).toHaveBeenCalledWith(77);
  const timeline = container.children[0] as HTMLDivElement;
  Object.defineProperty(timeline, 'clientHeight', { value: 200 });
  vi.spyOn(timeline.firstElementChild!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 400, 400, 40)
  );
  act(() => pending?.(0));
  expect(timeline.scrollTop).toBe(320);
  expect(container.children[1]!.scrollTop).toBe(320);
});
it('repeats an explicit reveal of the same clip but ignores ordinary renders and missing clips', () => {
  act(() => root.render(<Harness />));
  act(() => root.render(<Harness />));
  expect(navigateTo).toHaveBeenCalledTimes(1);
  act(() => root.render(<Harness command={{ ...request, serial: 2 }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  act(() => root.render(<Harness command={{ kind: 'clip', clipId: 'missing', serial: 3 }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  expect(pending).toBeNull();
});

it('reveals a selected note once while retaining manual scroll, visible notes and dormant data', () => {
  const selection: VideoEditorSelection = { kind: 'comment', documentId: 'doc', commentId: 'note' };
  let startTime = 0;
  let dormant = false;
  function NoteHarness({ command = selection }: { command?: VideoEditorSelection }) {
    const project = createEmptyVideoProject('Notes');
    project.duration = 100;
    project.commentDocuments = [
      {
        id: 'doc',
        binding: dormant
          ? { kind: 'source', assetId: 'retained', sourceInstanceId: 'cut' }
          : { kind: 'project' },
        canvasComments: [],
        annotations: [{ id: 'note', text: '', anchor: { kind: 'point', time: 80 } }],
      },
    ];
    useTimelineNoteReveal({
      selection: command,
      project,
      currentTime: 80,
      pixelsPerSecond: 100,
      viewportWidth: 1000,
      readStartTime: () => startTime,
      navigateTo,
    });
    return null;
  }
  act(() => root.render(<NoteHarness />));
  expect(navigateTo).toHaveBeenCalledExactlyOnceWith(75);
  act(() => root.render(<NoteHarness />));
  expect(navigateTo).toHaveBeenCalledTimes(1);
  act(() => root.render(<NoteHarness command={{ ...selection }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  startTime = 76;
  act(() => root.render(<NoteHarness command={{ ...selection }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  startTime = 0;
  dormant = true;
  act(() => root.render(<NoteHarness command={{ ...selection }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  act(() => root.render(<NoteHarness command={{ ...selection, commentId: 'missing' }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
});

it('reveals the exact source view, preserves manual renders, and cancels stale frame commands', () => {
  const project = createEmptyVideoProject();
  project.duration = 84;
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 640,
      height: 360,
      duration: 4,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const source = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 80);
  if (source.type !== 'VIDEO') throw new Error('Missing source');
  const audio = createVideoProjectAsset(
    'Voice',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'voice' },
    {
      width: 0,
      height: 0,
      duration: 4,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const track = createVideoProjectTrack('Voice', 2, 'AUDIO');
  project.tracks.push(track);
  project.assets.push(asset, audio);
  project.clips = [source];
  project.version = 31;
  project.sourceVoiceoverDocuments = [
    {
      id: 'doc',
      trackId: track.id,
      enabled: false,
      binding: {
        kind: 'source',
        assetId: asset.id,
        sourceInstanceId: source.sourceInstanceId ?? source.id,
      },
      reference: buildReviewTimeMap(4, []),
      take: {
        id: 'take',
        assetId: audio.id,
        timelineStart: 0,
        sourceOffset: 0,
        duration: 4,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        sourceAnchor: [{ start: 0, end: 4, offset: 0, duration: 4 }],
      },
    },
  ];
  const viewId = projectSourceVoiceoverViews(project, project.sourceVoiceoverDocuments[0]!)[0]!.clip
    .id;
  const command: TimelineRevealRequest = {
    kind: 'source-voiceover',
    documentId: 'doc',
    viewId,
    serial: 1,
  };
  function VoiceHarness({
    target,
    currentProject = project,
  }: {
    target: TimelineRevealRequest;
    currentProject?: typeof project;
  }) {
    const timelineRef = useRef<HTMLDivElement>(null);
    const trackListRef = useRef<HTMLDivElement>(null);
    useTimelineReveal({
      project: currentProject,
      request: target,
      pixelsPerSecond: 100,
      viewportWidth: 1000,
      navigateTo,
      timelineRef,
      trackListRef,
    });
    return (
      <>
        <div ref={timelineRef}>
          <div data-source-voiceover-view={viewId} />
          <div data-project-timeline-clip={viewId} />
        </div>
        <div ref={trackListRef} />
      </>
    );
  }
  act(() => root.render(<VoiceHarness target={command} />));
  expect(navigateTo).toHaveBeenCalledExactlyOnceWith(77);
  const timeline = container.children[0] as HTMLDivElement;
  Object.defineProperty(timeline, 'clientHeight', { value: 200 });
  vi.spyOn(timeline.children[0]!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 400, 400, 40)
  );
  vi.spyOn(timeline.children[1]!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 100, 400, 40)
  );
  act(() => pending?.(0));
  expect(timeline.scrollTop).toBe(320);
  expect(container.children[1]!.scrollTop).toBe(320);
  timeline.scrollTop = 12;
  act(() => root.render(<VoiceHarness target={command} />));
  expect(navigateTo).toHaveBeenCalledTimes(1);
  expect(timeline.scrollTop).toBe(12);
  const second = { ...command, serial: 2 };
  act(() => root.render(<VoiceHarness target={second} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  expect(cancelAnimationFrame).toHaveBeenCalled();
  const superseded = structuredClone(project);
  superseded.sourceVoiceoverDocuments = [];
  act(() => root.render(<VoiceHarness target={second} currentProject={superseded} />));
  timeline.scrollTop = 12;
  act(() => pending?.(0));
  expect(timeline.scrollTop).toBe(12);

  act(() => root.render(<VoiceHarness target={{ ...command, viewId: 'missing', serial: 3 }} />));
  expect(navigateTo).toHaveBeenCalledTimes(2);
  expect(pending).toBeNull();
  act(() =>
    root.render(<VoiceHarness target={{ ...command, documentId: 'missing', serial: 4 }} />)
  );
  expect(navigateTo).toHaveBeenCalledTimes(2);
});
