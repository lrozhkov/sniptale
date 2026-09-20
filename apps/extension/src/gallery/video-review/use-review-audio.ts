import {
  anchorReviewVoiceover,
  isReviewVoiceoverCut,
} from '../../features/video/review/voiceover-edits';
import { useEffect, useState } from 'react';
import type {
  QuickEditAudioClip,
  QuickEditAudioState,
  QuickEditOriginalAudio,
} from '../../features/video/review/advanced/types';
import {
  clampQuickEditAudioClip,
  moveQuickEditAudioClip,
  trimQuickEditAudioClip,
  updateQuickEditAudioClip,
} from '../../features/video/review/advanced/audio';
import { listMediaLibrary } from '../../composition/persistence/media-library';

export type ReviewAudioAsset = { filename: string; duration?: number };

export type ReviewAudioLane = 'voiceover' | 'music';

/** Owns audio-track selection and bounded clip mutations; writes go through autosave. */
export function useReviewAudio(args: {
  audio: QuickEditAudioState;
  setAudio(update: (audio: QuickEditAudioState) => QuickEditAudioState): void;
  timelineDuration: number;
  selectedId?: string | null;
  onSelectionChange?(selection: { lane: ReviewAudioLane; id: string } | null): void;
}) {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const selectedId = args.selectedId === undefined ? localSelectedId : args.selectedId;
  const setSelected = (id: string | null, lane?: ReviewAudioLane) => {
    if (args.selectedId === undefined) setLocalSelectedId(id);
    const resolvedLane =
      lane ??
      (['voiceover', 'music'] as const).find((candidate) =>
        args.audio[candidate].some((clip) => clip.id === id)
      );
    args.onSelectionChange?.(id && resolvedLane ? { lane: resolvedLane, id } : null);
  };
  const [assets, setAssets] = useReviewAudioAssets();
  const selected = (['voiceover', 'music'] as const)
    .flatMap((lane) => args.audio[lane].map((clip) => ({ lane, clip })))
    .find((item) => item.clip.id === selectedId);
  const patchLane = (
    lane: ReviewAudioLane,
    patch: (clips: QuickEditAudioClip[]) => QuickEditAudioClip[]
  ) => args.setAudio((audio) => ({ ...audio, [lane]: patch(audio[lane]) }));
  const laneDuration = (lane: ReviewAudioLane) =>
    lane === 'voiceover' && args.audio.voiceoverSegments
      ? args.audio.voiceoverSegments.at(-1)!.sourceEnd
      : args.timelineDuration;
  const updateClip = (
    lane: ReviewAudioLane,
    id: string,
    patch: (clip: QuickEditAudioClip) => QuickEditAudioClip
  ) =>
    patchLane(lane, (clips) =>
      clips.map((clip) => {
        if (clip.id !== id) return clip;
        const next = patch(clip);
        return next.id === id ? clampQuickEditAudioClip(next, laneDuration(lane)) : next;
      })
    );
  return {
    assets,
    selectedId,
    setSelectedId: setSelected,
    selected: selected
      ? {
          ...selected,
          cutSuppressed:
            selected.lane === 'voiceover' &&
            isReviewVoiceoverCut(selected.clip, args.audio.voiceoverSegments),
        }
      : null,
    addImported: (
      clip: QuickEditAudioClip,
      lane: ReviewAudioLane,
      assetDuration?: number,
      filename = ''
    ) => {
      setAssets((current) =>
        new Map(current).set(clip.assetId, {
          filename,
          ...(assetDuration !== undefined ? { duration: assetDuration } : {}),
        })
      );
      patchLane(lane, (clips) => [
        ...clips,
        lane === 'voiceover' && args.audio.voiceoverSegments
          ? anchorReviewVoiceover(clip, args.audio.voiceoverSegments)
          : clip,
      ]);
      setSelected(clip.id, lane);
    },
    moveClip: (lane: ReviewAudioLane, id: string, timelineStart: number) =>
      updateClip(lane, id, (clip) =>
        moveQuickEditAudioClip(clip, timelineStart, laneDuration(lane))
      ),
    trimClip: (
      lane: ReviewAudioLane,
      id: string,
      edge: 'start' | 'end',
      timelineTime: number,
      assetDuration?: number
    ) =>
      updateClip(lane, id, (clip) =>
        trimQuickEditAudioClip(
          clip,
          edge,
          timelineTime,
          laneDuration(lane),
          assetDuration ?? assets.get(clip.assetId)?.duration
        )
      ),
    patchClip: (
      lane: ReviewAudioLane,
      id: string,
      patch: Partial<Omit<QuickEditAudioClip, 'id' | 'assetId'>>
    ) => updateClip(lane, id, (clip) => updateQuickEditAudioClip(clip, patch)),
    removeClip: (lane: ReviewAudioLane, id: string) => {
      patchLane(lane, (clips) => clips.filter((clip) => clip.id !== id));
      if (selectedId === id) setSelected(null);
    },
    toggleLaneMute: (lane: ReviewAudioLane) =>
      patchLane(lane, (clips) => {
        const muted = !clips.every((clip) => clip.muted);
        return clips.map((clip) => ({ ...clip, muted }));
      }),
    setLaneVolume: (lane: ReviewAudioLane, volume: number) => {
      if (!Number.isFinite(volume)) return;
      args.setAudio((audio) => ({
        ...audio,
        laneVolumes: {
          voiceover: audio.laneVolumes?.voiceover ?? 1,
          music: audio.laneVolumes?.music ?? 1,
          [lane]: Math.max(0, Math.min(2, volume)),
        },
      }));
    },
    setOriginal: (patch: Partial<QuickEditOriginalAudio>) =>
      args.setAudio((audio) => ({ ...audio, original: { ...audio.original, ...patch } })),
  };
}

/** Resolves library metadata independently of selection and timeline mutations. */
function useReviewAudioAssets() {
  const [assets, setAssets] = useState<ReadonlyMap<string, ReviewAudioAsset>>(new Map());
  useEffect(() => {
    let active = true;
    void listMediaLibrary()
      .then((items) => {
        if (!active) return;
        setAssets((current) => {
          const next = new Map(current);
          for (const item of items) {
            if (item.source.kind !== 'project-asset') continue;
            const id = `project-asset:${item.source.projectAssetId}`;
            if (!next.has(id))
              next.set(id, {
                filename: item.filename,
                ...(item.duration !== null ? { duration: item.duration } : {}),
              });
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return [assets, setAssets] as const;
}
