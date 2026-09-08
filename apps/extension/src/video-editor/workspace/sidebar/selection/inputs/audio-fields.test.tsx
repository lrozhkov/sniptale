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
import { renderAudioFields } from './audio-fields';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
  project.assets = [asset];
  project.clips = [video, audio];
  return { project, video, audio };
}

it('controls the audio companion while inspecting its linked video', () => {
  const { project, video, audio } = fixture();
  const onMute = vi.fn();
  act(() =>
    root.render(
      renderAudioFields({
        project,
        selectedClip: video,
        onUpdateClipMuted: onMute,
        onUpdateClipVolume: vi.fn(),
        onUpdateClipAudioEnvelope: vi.fn(),
        onDetachClipGroup: vi.fn(),
      })
    )
  );
  const sound = container.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.videoSoundLabel"]'
  );
  expect(sound).not.toBeNull();
  act(() => sound!.click());
  expect(onMute).toHaveBeenCalledWith(audio.id, true);
  expect(video.muted).toBe(true);
});

it.each(['video', 'audio'] as const)(
  'unlinks from the %s inspector without muting sound',
  (kind) => {
    const f = fixture();
    const onDetach = vi.fn();
    const onMute = vi.fn();
    act(() =>
      root.render(
        renderAudioFields({
          project: f.project,
          selectedClip: f[kind],
          onUpdateClipMuted: onMute,
          onUpdateClipVolume: vi.fn(),
          onUpdateClipAudioEnvelope: vi.fn(),
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
      renderAudioFields({
        project: f.project,
        selectedClip: f.video,
        onUpdateClipMuted: onMute,
        onUpdateClipVolume: vi.fn(),
        onUpdateClipAudioEnvelope: vi.fn(),
        onDetachClipGroup: onDetach,
      })
    )
  );
  const sound = container.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.videoSoundLabel"]'
  )!;
  const detach = container.querySelector<HTMLButtonElement>(
    '[title="videoEditor.sidebar.detachButton"]'
  )!;
  expect(sound.disabled).toBe(true);
  expect(detach.disabled).toBe(true);
  act(() => {
    sound.click();
    detach.click();
  });
  expect(onMute).not.toHaveBeenCalled();
  expect(onDetach).not.toHaveBeenCalled();
});
