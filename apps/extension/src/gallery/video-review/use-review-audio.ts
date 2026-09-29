import { canPlaceOriginalAudioRange } from '../../features/video/review/advanced/original-audio';
import type { ReviewAnchor, ReviewEdit } from '../../features/video/review/types';
import {
  anchorReviewVoiceover,
  reanchorReviewVoiceover,
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
  sourceDuration?: number;
  edits?: readonly ReviewEdit[];
  selectedOriginalId?: string | null;
  onOriginalSelection?(id: string | null): void;
  selectedId?: string | null;
  onSelectionChange?(selection: { lane: ReviewAudioLane; id: string } | null): void;
}) {
  const original = useOriginalAudioRanges(args);
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
    ...original,
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
    markImported: (clip: QuickEditAudioClip, duration: number, filename: string) => {
      setAssets((current) => new Map(current).set(clip.assetId, { duration, filename }));
      setSelected(clip.id, 'voiceover');
    },
    moveClip: (lane: ReviewAudioLane, id: string, timelineStart: number) =>
      updateClip(lane, id, (clip) =>
        reanchorReviewVoiceover(
          moveQuickEditAudioClip(
            reanchorReviewVoiceover(clip, args.audio.voiceoverSegments),
            timelineStart,
            laneDuration(lane)
          ),
          args.audio.voiceoverSegments
        )
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
          reanchorReviewVoiceover(clip, args.audio.voiceoverSegments),
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

/** Source automation owns its drawing mode, selection and bounded source-time mutations. */
function useOriginalAudioRanges(args: Parameters<typeof useReviewAudio>[0]) {
  const [originalTool, setOriginalTool] = useState(false);
  const [originalRangeSelected, setOriginalRangeSelected] = useState(false);
  const [defaultOriginalVolume, setDefaultOriginalVolume] = useState(0.5);
  const [originalFeedback, setOriginalFeedback] = useState<
    'too-short' | 'overlap' | 'cut' | 'limit' | null
  >(null);
  const originalRanges = args.audio.original.ranges ?? [];
  const canAddOriginal = (range: ReviewAnchor, exceptId?: string) =>
    range.kind === 'range' &&
    (exceptId !== undefined || originalRanges.length < 512) &&
    canPlaceOriginalAudioRange(
      range,
      originalRanges,
      args.edits ?? [],
      args.sourceDuration ?? args.timelineDuration,
      exceptId
    );
  const updateOriginalRanges = (ranges: typeof originalRanges) =>
    args.setAudio((audio) => ({ ...audio, original: { ...audio.original, ranges } }));
  return {
    defaultOriginalVolume,
    setDefaultOriginalVolume: (volume: number) => {
      if (Number.isFinite(volume) && volume >= 0 && volume <= 2) setDefaultOriginalVolume(volume);
    },
    originalFeedback,
    originalRangeSelected,
    setOriginalRangeSelected,
    originalTool,
    setOriginalTool,
    canAddOriginal,
    selectedOriginal: originalRanges.find((range) => range.id === args.selectedOriginalId) ?? null,
    selectOriginal: (id: string) => {
      setOriginalRangeSelected(true);
      setOriginalTool(false);
      args.onOriginalSelection?.(id);
    },
    addOriginal: (range: ReviewAnchor): boolean => {
      if (range.kind !== 'range' || range.end - range.start < 0.01) {
        setOriginalFeedback('too-short');
        return false;
      }
      if (!canAddOriginal(range)) {
        setOriginalFeedback(
          originalRanges.length >= 512
            ? 'limit'
            : originalRanges.some((item) => item.start < range.end && item.end > range.start)
              ? 'overlap'
              : 'cut'
        );
        return false;
      }
      const id = crypto.randomUUID();
      setOriginalRangeSelected(true);
      updateOriginalRanges(
        [
          ...originalRanges,
          { id, start: range.start, end: range.end, volume: defaultOriginalVolume },
        ].sort((a, b) => a.start - b.start)
      );
      setOriginalTool(false);
      setOriginalFeedback(null);
      args.onOriginalSelection?.(id);
      return true;
    },
    patchOriginal: (id: string, patch: Partial<{ start: number; end: number; volume: number }>) => {
      const old = originalRanges.find((range) => range.id === id);
      if (!old) return;
      const next = { ...old, ...patch };
      if (
        !Number.isFinite(next.volume) ||
        next.volume < 0 ||
        next.volume > 2 ||
        !canPlaceOriginalAudioRange(
          next,
          originalRanges,
          args.edits ?? [],
          args.sourceDuration ?? args.timelineDuration,
          id
        )
      )
        return;
      updateOriginalRanges(
        originalRanges
          .map((range) => (range.id === id ? next : range))
          .sort((a, b) => a.start - b.start)
      );
    },
    removeOriginal: (id: string) => {
      updateOriginalRanges(originalRanges.filter((range) => range.id !== id));
      args.onOriginalSelection?.(null);
    },
  };
}
