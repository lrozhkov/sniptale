import { useVideoEditorStore } from '../../../state/store';
import { describe, expect, it, vi } from 'vitest';
import {
  createVideoProjectFromRecording,
  createEmptyVideoProject,
} from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
} from '../../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from '../test-store.test-support';

function createAudioPropertyStore() {
  return createVideoEditorProjectTestStore();
}

function createProjectWithEditableClip(): VideoProject {
  const project = createEmptyVideoProject('Audio');
  const [primaryTrack] = project.tracks;

  project.clips = [
    {
      assetId: 'asset-1',
      duration: 4,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: VideoMediaFitMode.CONTAIN,
      groupId: null,
      id: 'clip-1',
      linkMode: VideoClipLinkMode.DETACHED,
      muted: false,
      name: 'Clip',
      sourceDuration: 4,
      sourceStart: 0,
      startTime: 0,
      trackId: primaryTrack!.id,
      transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      type: VideoProjectClipType.VIDEO,
      volume: 1,
      volumeEnvelopeEnd: 1,
      volumeEnvelopeStart: 1,
    },
  ];

  return project;
}

describe('video editor clip audio property normalization', () => {
  it('normalizes transform, volume, and audio envelope updates on editable clips', () => {
    vi.spyOn(Date, 'now').mockReturnValue(700);
    const store = createAudioPropertyStore();

    store.getState().setProject(createProjectWithEditableClip());
    store.getState().updateClipTransform('clip-1', {
      height: 99999,
      opacity: -1,
      rotation: 999,
      width: 5,
      x: Number.NaN,
      y: -99999,
    });
    store.getState().updateClipVolume('clip-1', 5);
    store.getState().updateClipAudioEnvelope('clip-1', {
      volumeEnvelopeEnd: -2,
      volumeEnvelopeStart: 9,
    });

    expect(store.getState().project?.clips[0]).toEqual(
      expect.objectContaining({
        audioGainEnd: 0,
        audioGainStart: 2,
        transform: expect.objectContaining({
          height: 7680,
          opacity: 0,
          rotation: 360,
          width: 40,
          x: 0,
          y: -7680,
        }),
        sourceDuration: 4,
        volume: 1,
        volumeEnvelopeEnd: 0,
        volumeEnvelopeStart: 2,
      })
    );
    expect(store.getState().project?.updatedAt).toBe(700);
  });
});

describe('video editor clip audio property guardrails', () => {
  it('keeps invalid or locked clip updates as no-ops', () => {
    const store = createAudioPropertyStore();
    const project = createProjectWithEditableClip();

    store.getState().setProject(project);
    store.getState().updateClipTransform('clip-1', { x: Number.NaN });
    expect(store.getState().project?.clips[0]?.transform.x).toBe(0);

    store.getState().updateClipVolume('clip-1', Number.NaN);
    expect(store.getState().project?.clips[0]?.volume).toBe(1);

    store.getState().setProject({
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, locked: true })),
    });
    store.getState().updateClipMuted('clip-1', true);
    store.getState().updateClipAudioEnvelope('clip-1', { volumeEnvelopeStart: 0.25 });

    expect(store.getState().project?.clips[0]).toEqual(
      expect.objectContaining({
        muted: false,
        volumeEnvelopeStart: 1,
      })
    );
  });

  it('keeps undefined transform entries out of the patch while applying finite non-size values', () => {
    const store = createAudioPropertyStore();

    store.getState().setProject(createProjectWithEditableClip());
    store.getState().updateClipTransform('clip-1', {
      rotation: 12,
      x: undefined as unknown as number,
    });

    expect(store.getState().project?.clips[0]).toEqual(
      expect.objectContaining({
        transform: expect.objectContaining({ rotation: 12, x: 0 }),
      })
    );
  });
});

describe('transferred audio envelope editing', () => {
  it.each(['volume', 'envelope'] as const)('replaces only the gain phase through %s', (action) => {
    const store = createAudioPropertyStore();
    const project = createProjectWithEditableClip();
    const window = {
      offset: 0.5,
      holdAt: 3,
      fadePhase: { offset: 0.5, duration: 4 },
      gainPhase: { offset: 0.5, duration: 4 },
    };
    project.version = 43;
    project.clips[0]!.playbackWindow = window;
    store.getState().setProject(project);
    if (action === 'volume') store.getState().updateClipVolume('clip-1', 0.4);
    else store.getState().updateClipAudioEnvelope('clip-1', { volumeEnvelopeEnd: 0.4 });
    expect(store.getState().project?.clips[0]?.playbackWindow).toEqual({
      offset: 0.5,
      holdAt: 3,
      fadePhase: window.fadePhase,
    });
    expect(store.getState().project?.clips[0]?.audioGainEnd).toBe(0.4);
    expect(project.clips[0]?.playbackWindow).toEqual(window);
  });
});

it('restores transferred muted AUDIO through one positive-volume history action', () => {
  const store = useVideoEditorStore;
  const initial = store.getState();
  try {
    const project = createVideoProjectFromRecording({
      recordingId: 'recording',
      filename: 'Source',
      duration: 4,
      width: 640,
      height: 360,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: true,
    });
    const audio = project.clips.find((clip) => clip.type === 'AUDIO')!;
    const video = project.clips.find((clip) => clip.type === 'VIDEO')!;
    audio.muted = true;
    store.getState().setProject(project);
    const history = store.getState().projectHistory.past.length;
    store.getState().updateClipVolume(audio.id, 0.6);
    expect(store.getState().project!.clips.find((clip) => clip.id === audio.id)).toMatchObject({
      muted: false,
      audioGainStart: 0.6,
      audioGainEnd: 0.6,
    });
    expect(store.getState().projectHistory.past.length).toBe(history + 1);
    expect(store.getState().project!.clips.find((clip) => clip.id === video.id)?.muted).toBe(true);
    store.getState().undoProject();
    expect(store.getState().project!.clips.find((clip) => clip.id === audio.id)?.muted).toBe(true);
    store.getState().redoProject();
    expect(store.getState().project!.clips.find((clip) => clip.id === audio.id)?.muted).toBe(false);
  } finally {
    store.setState(initial, true);
  }
});
