import { useState } from 'react';
import type {
  QuickEditAudioClip,
  QuickEditAudioState,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';
import {
  clampQuickEditAudioClip,
  trimQuickEditAudioClip,
  updateQuickEditAudioClip,
} from '../../features/video/review/advanced/audio';

export type ReviewAudioLane = 'voiceover' | 'music';

/** Owns audio-track selection and bounded clip mutations; writes go through autosave. */
export function useReviewAudio(args: {
  audio: QuickEditAudioState;
  setAudio(update: (audio: QuickEditAudioState) => QuickEditAudioState): void;
  timelineDuration: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (['voiceover', 'music'] as const)
    .flatMap((lane) => args.audio[lane].map((clip) => ({ lane, clip })))
    .find((item) => item.clip.id === selectedId);
  const patchLane = (
    lane: ReviewAudioLane,
    patch: (clips: QuickEditAudioClip[]) => QuickEditAudioClip[]
  ) => args.setAudio((audio) => ({ ...audio, [lane]: patch(audio[lane]) }));
  const updateClip = (
    lane: ReviewAudioLane,
    id: string,
    patch: (clip: QuickEditAudioClip) => QuickEditAudioClip
  ) =>
    patchLane(lane, (clips) =>
      clips.map((clip) => {
        if (clip.id !== id) return clip;
        const next = patch(clip);
        return next.id === id ? clampQuickEditAudioClip(next, args.timelineDuration) : next;
      })
    );
  return {
    selectedId,
    setSelectedId,
    selected: selected ?? null,
    addImported: (clip: QuickEditAudioClip, lane: ReviewAudioLane) => {
      patchLane(lane, (clips) => [...clips, clip]);
      setSelectedId(clip.id);
    },
    moveClip: (lane: ReviewAudioLane, id: string, timelineStart: number) =>
      updateClip(lane, id, (clip) => ({
        ...clip,
        timelineStart: Math.max(0, Math.min(timelineStart, args.timelineDuration - clip.duration)),
      })),
    trimClip: (lane: ReviewAudioLane, id: string, edge: 'start' | 'end', timelineTime: number) =>
      updateClip(lane, id, (clip) =>
        trimQuickEditAudioClip(clip, edge, timelineTime, args.timelineDuration)
      ),
    patchClip: (
      lane: ReviewAudioLane,
      id: string,
      patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>
    ) => updateClip(lane, id, (clip) => updateQuickEditAudioClip(clip, patch)),
    removeClip: (lane: ReviewAudioLane, id: string) => {
      patchLane(lane, (clips) => clips.filter((clip) => clip.id !== id));
      setSelectedId((current) => (current === id ? null : current));
    },
    setOriginal: (patch: Partial<QuickEditOriginalAudio>) =>
      args.setAudio((audio) => ({ ...audio, original: { ...audio.original, ...patch } })),
  };
}
