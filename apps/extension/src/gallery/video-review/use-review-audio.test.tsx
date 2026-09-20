// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewAudio } from './use-review-audio';

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
