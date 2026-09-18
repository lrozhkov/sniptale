// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewAudio } from './use-review-audio';
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
