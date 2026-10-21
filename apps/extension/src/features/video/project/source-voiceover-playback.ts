import { projectSourceVoiceoverViews } from './source-voiceover-views';
import {
  areReviewVoiceoverSlicesContinuous,
  REVIEW_VOICEOVER_CONTINUITY_EPSILON,
} from '../review/voiceover-edits';
import {
  buildQuickEditAudioPlan,
  type QuickEditAudioPlanEntry,
} from '../review/advanced/audio-plan';
import type { QuickEditAudioClip } from '../review/advanced/types';
import type { AudioGainRange } from '../audio/source-attenuation';
import { projectSourceVoiceoverPlacement } from './voiceover-placement';
import {
  isSourceVoiceoverOriginalAudioClip,
  type VideoProjectSourceVoiceoverDocument,
} from './source-voiceover';
import { getProjectTrackAudioVolume } from './timeline/track-audio';
import type { VideoProject, VideoProjectAudioClip, VideoProjectVideoClip } from './types/model';

type Placement = VideoProjectAudioClip | VideoProjectVideoClip;

/** Disposable output-clock schedule; authored takes and their capture clocks remain intact. */
interface VideoProjectSourceVoiceoverPlayback {
  documentId: string;
  trackId: string;
  entry: QuickEditAudioPlanEntry;
}

function participates(project: VideoProject, document: VideoProjectSourceVoiceoverDocument) {
  return (
    document.enabled &&
    project.tracks.some(
      (track) => track.id === document.trackId && track.kind === 'AUDIO' && track.visible
    )
  );
}

function matches(
  project: VideoProject,
  document: VideoProjectSourceVoiceoverDocument,
  clip: Placement
) {
  return (
    isSourceVoiceoverOriginalAudioClip(document, clip) &&
    project.tracks.some((track) => track.id === clip.trackId && track.visible)
  );
}

/** Projects each occurrence independently, then joins continuous views of the same whole take. */
export function planProjectSourceVoiceoverPlayback(
  project: VideoProject
): VideoProjectSourceVoiceoverPlayback[] {
  return (project.sourceVoiceoverDocuments ?? []).flatMap((document) => {
    if (!participates(project, document)) return [];
    const views = projectSourceVoiceoverViews(project, document)
      .filter((view) => view.sourceVisible)
      .map((view) => view.clip);
    const master = getProjectTrackAudioVolume(project, document.trackId);
    return buildQuickEditAudioPlan({ voiceover: joinContinuousViews(views), music: [] }).map(
      (entry) => ({
        documentId: document.id,
        trackId: document.trackId,
        entry: { ...entry, volume: entry.volume * master },
      })
    );
  });
}

/** Live attenuation belongs to this occurrence, even when other placements overlap it. */
export function getProjectSourceVoiceoverOriginalAudioRanges(
  project: VideoProject,
  clip: Placement
): AudioGainRange[] {
  return (project.sourceVoiceoverDocuments ?? []).flatMap((document) => {
    if (
      document.originalAudioMuteVolume === undefined ||
      !participates(project, document) ||
      !matches(project, document, clip)
    )
      return [];
    const paired = document.originalAudioSourceInstanceId !== undefined;
    const views = paired
      ? projectSourceVoiceoverViews(project, document)
          .filter((view) => view.sourceVisible)
          .map((view) => view.clip)
      : projectSourceVoiceoverPlacement(document.take, document.reference, clip);
    return views.flatMap((view) => {
      const start = Math.max(clip.startTime, view.timelineStart);
      const end = Math.min(clip.startTime + clip.duration, view.timelineStart + view.duration);
      return end > start ? [{ start, end, volume: document.originalAudioMuteVolume! }] : [];
    });
  });
}

function joinContinuousViews(views: QuickEditAudioClip[]): QuickEditAudioClip[] {
  const chains: QuickEditAudioClip[] = [];
  const endpoints = new Map<string, Set<QuickEditAudioClip>>();
  const width = 2 * REVIEW_VOICEOVER_CONTINUITY_EPSILON;
  const cell = (time: number) => Math.floor(time / width);
  const key = (project: number, native: number) => `${project}:${native}`;
  const endpoint = (view: QuickEditAudioClip) =>
    key(
      cell(view.timelineStart + view.duration),
      cell(view.sourceOffset + view.duration * view.playbackRate!)
    );
  const add = (view: QuickEditAudioClip) => {
    const id = endpoint(view);
    const bucket = endpoints.get(id) ?? new Set<QuickEditAudioClip>();
    bucket.add(view);
    endpoints.set(id, bucket);
  };
  for (const view of [...views].sort(
    (a, b) => a.timelineStart - b.timelineStart || a.sourceOffset - b.sourceOffset
  )) {
    let previous: QuickEditAudioClip | undefined;
    const x = cell(view.timelineStart),
      y = cell(view.sourceOffset);
    for (let dx = -1; dx <= 1 && !previous; dx++) {
      for (let dy = -1; dy <= 1 && !previous; dy++) {
        previous = [...(endpoints.get(key(x + dx, y + dy)) ?? [])].find((candidate) =>
          areReviewVoiceoverSlicesContinuous(candidate, view)
        );
      }
    }
    if (previous) {
      const id = endpoint(previous),
        bucket = endpoints.get(id)!;
      bucket.delete(previous);
      if (!bucket.size) endpoints.delete(id);
      previous.duration += view.duration;
      add(previous);
    } else {
      const next = { ...view };
      chains.push(next);
      add(next);
    }
  }
  return chains;
}
