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
  expect(container.querySelector('[aria-pressed]')).toBeNull();
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
