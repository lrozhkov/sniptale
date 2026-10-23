import type { QuickEditAudioClip } from '../review/advanced/types';
import type { VideoProjectSourceVoiceoverDocument } from './source-voiceover';
import type { VideoProject } from './types/model';
import { projectSourceVoiceoverPlacement } from './voiceover-placement';

/** Disposable occurrence views retain their whole authored document identity. */
export interface VideoProjectSourceVoiceoverView {
  documentId: string;
  trackId: string;
  sourceClipId: string;
  sourceVisible: boolean;
  clip: QuickEditAudioClip;
}

/** Projects hidden and disabled occurrences for inspection; playback owns participation. */
export function projectSourceVoiceoverViews(
  project: VideoProject,
  document: VideoProjectSourceVoiceoverDocument
): VideoProjectSourceVoiceoverView[] {
  return project.clips.flatMap((placement) => {
    if (
      (placement.type !== 'VIDEO' && placement.type !== 'AUDIO') ||
      placement.assetId !== document.binding.assetId ||
      (placement.sourceInstanceId ?? placement.id) !== document.binding.sourceInstanceId
    )
      return [];
    const sourceVisible = project.tracks.some(
      (track) => track.id === placement.trackId && track.visible
    );
    return projectSourceVoiceoverPlacement(document.take, document.reference, placement).map(
      (clip) => ({
        documentId: document.id,
        trackId: document.trackId,
        sourceClipId: placement.id,
        sourceVisible,
        clip,
      })
    );
  });
}

/** Resolves inspection navigation across every current occurrence of one authored take. */
export function resolveSourceVoiceoverNavigation(
  project: VideoProject,
  documentId: string,
  currentTime: number
) {
  const document = project.sourceVoiceoverDocuments?.find((item) => item.id === documentId);
  const views = document ? projectSourceVoiceoverViews(project, document) : [];
  let nearest: VideoProjectSourceVoiceoverView | null = null;
  let bestRank = Infinity;
  let bestDistance = Infinity;
  let start = Infinity;
  let end = -Infinity;
  for (const view of views) {
    const from = view.clip.timelineStart;
    const to = from + view.clip.duration;
    start = Math.min(start, from);
    end = Math.max(end, to);
    const rank = currentTime >= from && currentTime < to ? 0 : 1;
    const distance = Math.max(from - currentTime, currentTime - to, 0);
    if (
      !nearest ||
      rank < bestRank ||
      (rank === bestRank &&
        (distance < bestDistance ||
          (distance === bestDistance &&
            (from < nearest.clip.timelineStart ||
              (from === nearest.clip.timelineStart && view.clip.id < nearest.clip.id)))))
    ) {
      nearest = view;
      bestRank = rank;
      bestDistance = distance;
    }
  }
  return { nearest, range: views.length ? { startTime: start, duration: end - start } : null };
}
