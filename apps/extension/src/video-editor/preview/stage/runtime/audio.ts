import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import {
  getClipEndTime,
  getSortedTracks,
  getTrackClips,
  isAudioClip,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import { createPreviewMediaSyncState, updatePreviewMediaSyncState } from '../media/sync';
import {
  cleanupPreviewAudio,
  syncPreviewAudioElements,
  type PreviewStageAudioElementSyncParams,
} from './audio-elements';
import { isAudioDrivenPreviewClip } from './audio-clips';
import { createPreviewAudioGraphState } from './playback/audio-graph';
import type { PreviewStageAudioBankClip, PreviewStageAudioSyncParams } from '../types';

const PREVIEW_STAGE_AUDIO_WARMUP_SECONDS = 0.5;

export function useActivePreviewAudioClips(project: VideoProject, currentTime: number) {
  return useMemo(() => {
    const result: PreviewStageAudioBankClip[] = [];

    for (const track of getSortedTracks(project)) {
      if (!track.visible) {
        continue;
      }

      for (const clip of getTrackClips(project, track.id)) {
        if ((isAudioClip(clip) || isVideoClip(clip)) && isClipActiveAtTime(clip, currentTime)) {
          result.push(clip);
        }
      }
    }

    return result;
  }, [currentTime, project]);
}

export function usePreviewStageAudioBankClips(
  project: VideoProject,
  currentTime: number,
  activeAudioClips: VideoProjectClip[]
) {
  return useMemo(() => {
    const bankedClipIds = new Set(activeAudioClips.map((clip) => clip.id));
    const bankCandidates = [...activeAudioClips];

    for (const track of getSortedTracks(project)) {
      if (!track.visible) {
        continue;
      }

      for (const clip of getTrackClips(project, track.id)) {
        if (bankedClipIds.has(clip.id) || (!isAudioClip(clip) && !isVideoClip(clip))) {
          continue;
        }

        const warmupStart = clip.startTime - PREVIEW_STAGE_AUDIO_WARMUP_SECONDS;
        const warmupEnd = getClipEndTime(clip) + PREVIEW_STAGE_AUDIO_WARMUP_SECONDS;
        if (currentTime < warmupStart || currentTime >= warmupEnd) {
          continue;
        }

        bankedClipIds.add(clip.id);
        bankCandidates.push(clip);
      }
    }

    const bankCandidateById = new Map(bankCandidates.map((clip) => [clip.id, clip]));
    return bankCandidates.filter((clip) =>
      isAudioDrivenPreviewClip(project, clip, bankCandidateById)
    );
  }, [activeAudioClips, currentTime, project]);
}

export function usePreviewStageAudioSync(params: PreviewStageAudioSyncParams): void {
  const { audioRefs, currentTime, isPlaying, project, syncedClips } = params;
  const audioGraphStateRef = useRef(createPreviewAudioGraphState());
  const mediaSyncStateRef = useRef(createPreviewMediaSyncState());

  useLayoutEffect(() => {
    syncPreviewAudioElements({
      audioGraphState: audioGraphStateRef.current,
      audioRefs,
      currentTime,
      isPlaying,
      mediaSyncState: mediaSyncStateRef.current,
      project,
      syncedClips,
    } satisfies PreviewStageAudioElementSyncParams);
    updatePreviewMediaSyncState(mediaSyncStateRef.current, currentTime, isPlaying);
  }, [audioRefs, currentTime, isPlaying, project, syncedClips]);

  useEffect(() => {
    const audioGraphState = audioGraphStateRef.current;
    return () => {
      cleanupPreviewAudio({ audioGraphState, audioRefs });
    };
  }, [audioRefs]);
}
