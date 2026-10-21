import { useVideoEditorStore } from '../../../../state/store';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import {
  createRecordingProjectAsset,
  createRecordingBaseClip,
  createRecordingAudioClip,
} from '../../../../../features/video/project/factories/recording';
import { renderAudioFields, renderClipLinkFields } from './audio-fields';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let container: HTMLDivElement;
let root: Root;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useVideoEditorStore.setState(initial, true);
  vi.unstubAllGlobals();
});

function fixture() {
  const project = createEmptyVideoProject('Linked audio');
  const audioTrack = createVideoProjectTrack('Audio', 1, 'AUDIO');
  project.tracks.push(audioTrack);
  const asset = createRecordingProjectAsset({
    recordingId: 'recording',
    filename: 'Source',
    duration: 4,
    width: 1280,
    height: 720,
    mimeType: 'video/mp4',
    size: 100,
    hasAudio: true,
  });
  const video = createRecordingBaseClip(
    asset,
    { duration: 4, width: 1280, height: 720 },
    project.tracks[0]!.id,
    'pair'
  );
  const audio = createRecordingAudioClip(asset, audioTrack.id, 4, 'pair');
  if (audio.type !== 'AUDIO') throw new Error('Missing audio fixture');
  project.assets = [asset];
  project.clips = [video, audio];
  return { project, video, audio };
}

it('does not expose sound controls on video or an extra mute toggle on audio', () => {
  const { project, video, audio } = fixture();
  const props = {
    project,
    onUpdateClipMuted: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onDetachClipGroup: vi.fn(),
  };
  expect(renderAudioFields({ ...props, selectedClip: video })).toBeNull();
  act(() => root.render(renderAudioFields({ ...props, selectedClip: audio })));
  expect(container.textContent).toContain('videoEditor.sidebar.volumeLabel');
  expect(container.querySelector('[role="switch"]')).toBeNull();
  expect(container.textContent).toContain('videoEditor.sidebar.audioDurationContent');
});

it.each(['video', 'audio'] as const)(
  'unlinks from the %s inspector without muting sound',
  (kind) => {
    const f = fixture();
    const onDetach = vi.fn();
    const onMute = vi.fn();
    act(() =>
      root.render(
        renderClipLinkFields({
          project: f.project,
          selectedClip: f[kind],
          onDetachClipGroup: onDetach,
        })
      )
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[title="videoEditor.sidebar.detachButton"]')!
        .click()
    );
    expect(onDetach).toHaveBeenCalledWith(f[kind].id);
    expect(onMute).not.toHaveBeenCalled();
  }
);

it('respects the audio track lock even while inspecting an unlocked video', () => {
  const f = fixture();
  f.project.tracks = f.project.tracks.map((track) => ({
    ...track,
    locked: track.id === f.audio.trackId,
  }));
  const onMute = vi.fn();
  const onDetach = vi.fn();
  act(() =>
    root.render(
      renderClipLinkFields({
        project: f.project,
        selectedClip: f.video,
        onDetachClipGroup: onDetach,
      })
    )
  );
  const detach = container.querySelector<HTMLButtonElement>(
    '[title="videoEditor.sidebar.detachButton"]'
  )!;
  expect(detach.disabled).toBe(true);
  act(() => {
    detach.click();
  });
  expect(onMute).not.toHaveBeenCalled();
  expect(onDetach).not.toHaveBeenCalled();
});

it('changes audio duration through the actual store without trimming its tail', () => {
  const { project, audio, video } = fixture();
  video.duration = 2;
  video.sourceDuration = 2;
  project.duration = 4;
  audio.fadeOutMs = 1500;
  useVideoEditorStore.getState().setProject(project);
  const before = structuredClone(
    useVideoEditorStore.getState().project!.clips.find((clip) => clip.id === audio.id)!
  );
  function Harness() {
    const current = useVideoEditorStore((state) => state.project);
    return current
      ? renderAudioFields({
          project: current,
          selectedClip: current.clips.find((clip) => clip.id === audio.id)!,
          onUpdateClipMuted: vi.fn(),
          onUpdateClipVolume: vi.fn(),
          onUpdateClipAudioEnvelope: vi.fn(),
          onDetachClipGroup: vi.fn(),
        })
      : null;
  }
  act(() => root.render(<Harness />));
  const click = (label: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent === label
    );
    if (!button) throw new Error('Missing duration choice');
    act(() => button.click());
  };
  const history = useVideoEditorStore.getState().projectHistory.past.length;
  click('videoEditor.sidebar.contentDurationProject');
  expect(useVideoEditorStore.getState().project!.duration).toBe(2);
  expect(useVideoEditorStore.getState().project!.version).toBe(30);
  expect(
    useVideoEditorStore.getState().project!.clips.find((clip) => clip.id === audio.id)
  ).toEqual({ ...before, durationMode: 'project' });
  click('videoEditor.sidebar.contentDurationProject');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(history + 1);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.duration).toBe(4);
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.duration).toBe(2);
  click('videoEditor.sidebar.audioDurationContent');
  expect(useVideoEditorStore.getState().project!.duration).toBe(4);
  const current = useVideoEditorStore.getState().project!;
  act(() =>
    useVideoEditorStore.getState().setProject({
      ...current,
      tracks: current.tracks.map((track) => ({ ...track, locked: true })),
    })
  );
  const locked = useVideoEditorStore.getState().project;
  click('videoEditor.sidebar.contentDurationProject');
  expect(useVideoEditorStore.getState().project).toBe(locked);
});

it('preserves audio duration policy through real split and duplicate commands', () => {
  const { project, audio, video } = fixture();
  audio.durationMode = 'project';
  audio.linkMode = 'DETACHED';
  audio.groupId = null;
  video.duration = 2;
  video.sourceDuration = 2;
  project.version = 30;
  project.duration = 2;
  useVideoEditorStore.getState().setProject(project);
  act(() => useVideoEditorStore.getState().splitClipAt(audio.id, 1));
  const split = useVideoEditorStore.getState().project!;
  const takes = split.clips.filter((clip) => clip.type === 'AUDIO');
  expect(takes).toHaveLength(2);
  expect(takes.every((clip) => clip.durationMode === 'project')).toBe(true);
  expect(takes.reduce((total, clip) => total + clip.sourceDuration, 0)).toBe(4);
  expect(split.duration).toBe(2);
  act(() => useVideoEditorStore.getState().duplicateClip(takes[1]!.id));
  const duplicated = useVideoEditorStore.getState().project!;
  expect(duplicated.clips.filter((clip) => clip.type === 'AUDIO')).toHaveLength(3);
  expect(
    duplicated.clips
      .filter((clip) => clip.type === 'AUDIO')
      .every((clip) => clip.durationMode === 'project')
  ).toBe(true);
  expect(duplicated.duration).toBe(2);
});
