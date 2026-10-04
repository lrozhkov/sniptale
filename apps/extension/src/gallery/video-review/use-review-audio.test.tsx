// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewAudio } from './use-review-audio';
import {
  anchorReviewVoiceover,
  projectReviewVoiceover,
  reviewVoiceoverRange,
} from '../../features/video/review/voiceover-edits';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

vi.mock('../../composition/persistence/media-library', () => ({
  listMediaLibrary: vi.fn(async () => []),
}));
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import type { QuickEditAudioState } from '../../features/video/review/advanced/types';

it('owns selection, bounded clip mutations, and the original audio gate', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const clipA = createQuickEditAudioClip({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 1,
    duration: 2,
    endMax: 10,
  });
  let audioState: QuickEditAudioState = {
    original: { muted: false, volume: 1 },
    voiceover: [],
    music: [clipA],
  };
  const setAudio = vi.fn((update: (audio: QuickEditAudioState) => QuickEditAudioState) => {
    audioState = update(audioState);
  });
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewAudio>;
  function Harness() {
    hook = useReviewAudio({ audio: audioState, setAudio, timelineDuration: 10 });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    expect(hook.selected).toBeNull();
    act(() => hook.setSelectedId('a1'));
    expect(hook.selected?.lane).toBe('music');
    expect(hook.selected?.clip.id).toBe('a1');
    act(() => hook.setSelectedId('missing'));
    expect(hook.selected).toBeNull();

    act(() => hook.setSelectedId('a1'));
    act(() => hook.moveClip('music', 'a1', 9.5));
    expect(audioState.music[0]!.timelineStart).toBe(8);

    act(() => hook.trimClip('music', 'a1', 'start', 9));
    expect(audioState.music[0]!.timelineStart).toBe(9);
    expect(audioState.music[0]!.sourceOffset).toBe(1);

    act(() => hook.patchClip('music', 'a1', { volume: 3, fadeIn: 100 }));
    expect(audioState.music[0]!.volume).toBe(2);
    expect(audioState.music[0]!.fadeIn).toBe(60);

    act(() => hook.removeClip('music', 'a1'));
    expect(audioState.music).toHaveLength(0);

    const imported = createQuickEditAudioClip({
      id: 'a2',
      assetId: 'asset:2',
      timelineStart: 0,
      duration: 3,
      endMax: 10,
    });
    act(() => hook.addImported(imported, 'voiceover'));
    expect(audioState.voiceover).toHaveLength(1);
    expect(hook.selected?.lane).toBe('voiceover');

    act(() => hook.setOriginal({ muted: true, volume: 0.5 }));
    expect(audioState.original).toEqual({ muted: true, volume: 0.5 });
    act(() => hook.setOriginal({ volume: 0.75 }));
    expect(audioState.original).toEqual({ muted: false, volume: 0.75 });
    act(() => hook.setOriginal({ volume: Number.NaN }));
    expect(audioState.original).toEqual({ muted: false, volume: 0.75 });
    act(() => hook.setOriginal({ volume: -2, muted: false }));
    expect(audioState.original).toEqual({ muted: true, volume: 0 });
    act(() => hook.setOriginal({ muted: false }));
    expect(audioState.original).toEqual({ muted: false, volume: 1 });
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('bounds trims to library-known asset durations and keeps moves duration-stable', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { listMediaLibrary } = await import('../../composition/persistence/media-library');
  vi.mocked(listMediaLibrary).mockResolvedValue([
    {
      id: 'item:2',
      entityId: '2',
      type: 'audio',
      kind: 'audio',
      filename: 'take.webm',
      originalFilename: 'take.webm',
      createdAt: 1,
      updatedAt: 1,
      size: 10,
      mimeType: 'audio/webm',
      width: null,
      height: null,
      duration: 2,
      hasThumbnail: false,
      imageContentState: null,
      presentationRevision: null,
      workspaceRevision: null,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: [],
      lifecycle: 'ready',
      source: { kind: 'project-asset', projectAssetId: '2' },
    },
  ] as never);
  const clipA = createQuickEditAudioClip({
    id: 'a2',
    assetId: 'project-asset:2',
    timelineStart: 5,
    duration: 2,
    endMax: 20,
  });
  let audioState: QuickEditAudioState = {
    original: { muted: false, volume: 1 },
    voiceover: [],
    music: [clipA],
  };
  const setAudio = vi.fn((update: (audio: QuickEditAudioState) => QuickEditAudioState) => {
    audioState = update(audioState);
  });
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewAudio>;
  function Harness() {
    hook = useReviewAudio({ audio: audioState, setAudio, timelineDuration: 20 });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => hook.trimClip('music', 'a2', 'start', 0));
    expect(audioState.music[0]!.timelineStart).toBe(5);
    expect(audioState.music[0]!.duration).toBe(2);
    act(() => hook.trimClip('music', 'a2', 'end', 20));
    expect(audioState.music[0]!.duration).toBe(2);
    act(() => hook.moveClip('music', 'a2', 19.5));
    expect(audioState.music[0]!.timelineStart).toBe(18);
    expect(audioState.music[0]!.duration).toBe(2);
  } finally {
    await act(async () => root.unmount());
  }
  vi.unstubAllGlobals();
});

it('keeps cut-suppressed recordings editable without trimming them to the shortened result', async () => {
  const { anchorReviewVoiceover } = await import('../../features/video/review/voiceover-edits');
  const { buildReviewTimeMap } = await import('../../features/video/review/timeline');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const clip = anchorReviewVoiceover(
    createQuickEditAudioClip({
      id: 'voice',
      assetId: 'asset',
      timelineStart: 4,
      duration: 4,
      endMax: 12,
    }),
    buildReviewTimeMap(12, [])
  );
  let audio: QuickEditAudioState = {
    original: { muted: false, volume: 1 },
    voiceover: [clip],
    music: [],
    voiceoverSegments: buildReviewTimeMap(12, [
      { id: 'cut', kind: 'cut', start: 2, end: 8, requestedStart: 2, requestedEnd: 8 },
    ]),
  };
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewAudio>;
  function Harness() {
    hook = useReviewAudio({
      audio,
      timelineDuration: 6,
      selectedId: 'voice',
      setAudio: (update) => {
        audio = update(audio);
      },
    });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(hook.selected?.cutSuppressed).toBe(true);
    await act(async () => hook.patchClip('voiceover', 'voice', { volume: 0.5 }));
    expect(audio.voiceover[0]).toMatchObject({
      timelineStart: 4,
      duration: 4,
      sourceOffset: 0,
      volume: 0.5,
    });
    await act(async () => hook.moveClip('voiceover', 'voice', 8));
    await act(async () => root.render(<Harness />));
    expect(hook.selected?.cutSuppressed).toBe(false);
    expect(audio.voiceover[0]).toMatchObject({ timelineStart: 8, duration: 4 });
    await act(async () => hook.trimClip('voiceover', 'voice', 'start', 9));
    expect(audio.voiceover[0]).toMatchObject({ timelineStart: 9, duration: 3, sourceOffset: 1 });
    const imported = createQuickEditAudioClip({
      id: 'new',
      assetId: 'new-asset',
      timelineStart: 3,
      duration: 2,
      endMax: 6,
    });
    await act(async () => hook.addImported(imported, 'voiceover'));
    expect(audio.voiceover[1]).toMatchObject({ timelineStart: 9, duration: 2 });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('commits trim samples from the displayed speed geometry without changing neighbouring recordings', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const recording = anchorReviewVoiceover(
    createQuickEditAudioClip({
      id: 'voice',
      assetId: 'asset',
      timelineStart: 2,
      duration: 2,
      endMax: 10,
    }),
    buildReviewTimeMap(10, [])
  );
  const neighbour = { ...recording, id: 'other' };
  let audioState: QuickEditAudioState = {
    original: { volume: 1, muted: false },
    music: [],
    voiceover: [recording, neighbour],
    voiceoverSegments: buildReviewTimeMap(10, [
      {
        id: 'speed',
        kind: 'speed',
        start: 2,
        end: 6,
        requestedStart: 2,
        requestedEnd: 6,
        rate: 2,
        audio: 'speed',
      },
    ]),
  };
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewAudio>;
  function Harness() {
    hook = useReviewAudio({
      audio: audioState,
      timelineDuration: 8,
      setAudio: (update) => {
        audioState = update(audioState);
      },
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    act(() => hook.trimClip('voiceover', 'voice', 'start', 3, 2));
    expect(audioState.voiceover[0]).toMatchObject({
      timelineStart: 3,
      duration: 1.5,
      sourceOffset: 0.5,
    });
    expect(reviewVoiceoverRange(audioState.voiceover[0]!)).toEqual({ start: 3, end: 6 });
    expect(audioState.voiceover[1]).toBe(neighbour);
    act(() => root.render(<Harness />));
    act(() => hook.moveClip('voiceover', 'voice', 6));
    expect(audioState.voiceover[0]).toMatchObject({
      timelineStart: 6,
      duration: 1.5,
      sourceOffset: 0.5,
    });
    expect(reviewVoiceoverRange(audioState.voiceover[0]!)).toEqual({ start: 6, end: 7.5 });
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('preserves actual playback duration when moving voice from Speed into normal time', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const recording = anchorReviewVoiceover(
    createQuickEditAudioClip({
      id: 'voice',
      assetId: 'voice',
      timelineStart: 2,
      duration: 2,
      endMax: 10,
    }),
    buildReviewTimeMap(10, [])
  );
  const map = buildReviewTimeMap(10, [
    {
      id: 'speed',
      kind: 'speed',
      start: 2,
      end: 6,
      requestedStart: 2,
      requestedEnd: 6,
      rate: 2,
      audio: 'speed',
    },
  ]);
  let audio: QuickEditAudioState = {
    original: { volume: 1, muted: false },
    music: [],
    voiceover: [recording],
    voiceoverSegments: map,
  };
  let hook!: ReturnType<typeof useReviewAudio>;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    hook = useReviewAudio({
      audio,
      timelineDuration: 8,
      setAudio: (update) => {
        audio = update(audio);
      },
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    expect(projectReviewVoiceover(audio.voiceover, map)[0]?.duration).toBe(2);
    act(() => hook.moveClip('voiceover', 'voice', 6));
    expect(projectReviewVoiceover(audio.voiceover, map)[0]?.duration).toBe(2);
    expect(audio.voiceover[0]?.duration).toBe(2);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('creates, selects, edits and removes original source automation with bounded rejection feedback', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let audio: QuickEditAudioState = {
    original: { muted: false, volume: 1 },
    voiceover: [],
    music: [],
  };
  let selected: string | null = null;
  let hook!: ReturnType<typeof useReviewAudio>;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    hook = useReviewAudio({
      audio,
      timelineDuration: 10,
      sourceDuration: 12,
      edits: [{ id: 'cut', kind: 'cut', start: 8, end: 9, requestedStart: 8, requestedEnd: 9 }],
      selectedOriginalId: selected,
      onOriginalSelection: (id) => {
        selected = id;
      },
      setAudio: (update) => {
        audio = update(audio);
      },
    });
    return null;
  }
  const run = (action: () => void) =>
    act(() => {
      action();
      root.render(<Harness />);
    });
  try {
    act(() => root.render(<Harness />));
    run(() => hook.setDefaultOriginalVolume(0.7));
    run(() => hook.setOriginalTool(true));
    run(() => {
      expect(hook.addOriginal({ kind: 'range', start: 2, end: 4 })).toBe(true);
    });
    expect(audio.original.ranges).toMatchObject([{ start: 2, end: 4, volume: 0.7 }]);
    expect(hook.originalTool).toBe(false);
    expect(hook.selectedOriginal?.id).toBe(selected);
    const id = selected!;
    run(() => hook.setDefaultOriginalVolume(Number.NaN));
    expect(hook.defaultOriginalVolume).toBe(0.7);
    run(() => hook.selectOriginal(id));
    expect(hook.originalRangeSelected).toBe(true);
    run(() => hook.patchOriginal(id, { start: 3, end: 5, volume: 1.2 }));
    expect(audio.original.ranges).toMatchObject([{ start: 3, end: 5, volume: 1.2 }]);
    run(() => hook.patchOriginal(id, { volume: Infinity }));
    run(() => hook.patchOriginal(id, { volume: -1 }));
    run(() => hook.patchOriginal(id, { end: 13 }));
    run(() => hook.patchOriginal('absent', { volume: 0.1 }));
    expect(audio.original.ranges).toMatchObject([{ start: 3, end: 5, volume: 1.2 }]);
    run(() => {
      expect(hook.addOriginal({ kind: 'point', time: 1 })).toBe(false);
    });
    expect(hook.originalFeedback).toBe('too-short');
    run(() => {
      expect(hook.addOriginal({ kind: 'range', start: 4, end: 6 })).toBe(false);
    });
    expect(hook.originalFeedback).toBe('overlap');
    run(() => {
      expect(hook.addOriginal({ kind: 'range', start: 8, end: 9 })).toBe(false);
    });
    expect(hook.originalFeedback).toBe('cut');
    run(() => hook.removeOriginal(id));
    expect(audio.original.ranges).toEqual([]);
    expect(selected).toBeNull();
    expect(hook.selectedOriginal).toBeNull();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('keeps lane gains and mute independent of clip samples and enforces the source range limit', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const clip = createQuickEditAudioClip({
    id: 'voice',
    assetId: 'voice-asset',
    timelineStart: 1,
    duration: 2,
    endMax: 10,
  });
  let audio: QuickEditAudioState = {
    original: { muted: false, volume: 1 },
    voiceover: [clip],
    music: [],
  };
  let hook!: ReturnType<typeof useReviewAudio>;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    hook = useReviewAudio({
      audio,
      timelineDuration: 10,
      setAudio: (update) => {
        audio = update(audio);
      },
    });
    return null;
  }
  const run = (action: () => void) =>
    act(() => {
      action();
      root.render(<Harness />);
    });
  try {
    act(() => root.render(<Harness />));
    run(() => hook.setLaneVolume('voiceover', 3));
    run(() => hook.setLaneVolume('music', -0.5));
    run(() => hook.setLaneVolume('music', Number.NaN));
    expect(audio.laneVolumes).toEqual({ voiceover: 2, music: 0 });
    run(() => hook.toggleLaneMute('voiceover'));
    expect(audio.voiceover[0]).toEqual({ ...clip, muted: true });
    run(() => hook.toggleLaneMute('voiceover'));
    expect(audio.voiceover[0]).toEqual(clip);
    run(() => hook.markImported(clip, 5, 'take.wav'));
    expect(hook.assets.get('voice-asset')).toEqual({ duration: 5, filename: 'take.wav' });
    run(() => hook.removeClip('voiceover', 'voice'));
    expect(hook.selected).toBeNull();
    audio = {
      ...audio,
      original: {
        ...audio.original,
        ranges: Array.from({ length: 512 }, (_, i) => ({
          id: `range-${i}`,
          start: i / 100,
          end: (i + 0.2) / 100,
          volume: 1,
        })),
      },
    };
    run(() => {});
    run(() => {
      expect(hook.addOriginal({ kind: 'range', start: 9, end: 10 })).toBe(false);
    });
    expect(hook.originalFeedback).toBe('limit');
    expect(audio.original.ranges).toHaveLength(512);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('creates lossless timing when own tempo is edited before the first video Speed', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let audio: QuickEditAudioState = {
    original: { muted: false, volume: 1 },
    music: [],
    voiceover: [
      createQuickEditAudioClip({
        id: 'voice',
        assetId: 'asset',
        timelineStart: 2,
        duration: 4,
        endMax: 12,
      }),
    ],
  };
  let hook!: ReturnType<typeof useReviewAudio>;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    hook = useReviewAudio({
      audio,
      timelineDuration: 12,
      setAudio: (update) => {
        audio = update(audio);
      },
    });
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    act(() => hook.patchClip('voiceover', 'voice', { tempo: 0.25 }));
    expect(audio.voiceover[0]).toMatchObject({ tempo: 0.25, duration: 4, sourceOffset: 0 });
    expect(audio.voiceoverSegments).toEqual(buildReviewTimeMap(12, []));
    expect(projectReviewVoiceover(audio.voiceover, audio.voiceoverSegments)[0]).toMatchObject({
      duration: 10,
      playbackRate: 0.25,
    });
    act(() => root.render(<Harness />));
    act(() => hook.patchClip('voiceover', 'voice', { tempo: 2 }));
    expect(projectReviewVoiceover(audio.voiceover, audio.voiceoverSegments)[0]).toMatchObject({
      duration: 2,
      playbackRate: 2,
    });
    expect(audio.voiceover[0]?.duration).toBe(4);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
