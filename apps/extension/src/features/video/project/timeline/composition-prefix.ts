import type { VideoProject } from '../types/model';
import { MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../validation/primitives';

/**
 * Moves an accepted composition to make room before it. Source seconds and local
 * animation phases stay unchanged. The caller owns admission, history and publication.
 */
export function prefixVideoProjectComposition(
  project: VideoProject,
  delta: number
): VideoProject | null {
  if (!Number.isFinite(delta) || delta < 0) return null;
  if (delta === 0) return project;
  let valid = true;
  const shift = (time: number, maximum = MAX_VIDEO_PROJECT_DURATION_SECONDS): number => {
    const result = time + delta;
    if (!Number.isFinite(result) || result < 0 || result > maximum) valid = false;
    return result;
  };
  const next: VideoProject = {
    ...project,
    duration: shift(project.duration),
    clips: project.clips.map((clip) => ({ ...clip, startTime: shift(clip.startTime) })),
    actionEvents: project.actionEvents.map((event) =>
      event.anchor.kind === 'project'
        ? { ...event, anchor: { ...event.anchor, time: shift(event.anchor.time) } }
        : event
    ),
    // Explicit cache translation prevents reconciliation from projecting these again.
    cursorTrack: project.cursorTrack
      ? {
          ...project.cursorTrack,
          samples: project.cursorTrack.samples.map((sample) => ({
            ...sample,
            time: shift(sample.time),
          })),
        }
      : null,
    ...(project.effectInstances === undefined
      ? {}
      : {
          effectInstances: project.effectInstances.map((effect) => ({
            ...effect,
            startTime: shift(effect.startTime),
          })),
        }),
    ...(project.motionRegions === undefined
      ? {}
      : {
          motionRegions: project.motionRegions.map((region) => ({
            ...region,
            startTime: shift(region.startTime),
          })),
        }),
    ...(project.objectTracks === undefined
      ? {}
      : {
          objectTracks: project.objectTracks.map((track) => ({
            ...track,
            samples: track.samples.map((sample) => ({
              ...sample,
              time: shift(sample.time, Infinity),
            })),
            ...(track.correctionAnchors === undefined
              ? {}
              : {
                  correctionAnchors: track.correctionAnchors.map((anchor) => ({
                    ...anchor,
                    time: shift(anchor.time, Infinity),
                  })),
                }),
            ...(track.analysis === undefined
              ? {}
              : {
                  analysis: {
                    ...track.analysis,
                    projectStartTime: shift(track.analysis.projectStartTime, Infinity),
                    projectEndTime: shift(track.analysis.projectEndTime, Infinity),
                  },
                }),
          })),
        }),
    ...(project.cursorFocusPath === undefined
      ? {}
      : {
          cursorFocusPath: {
            ...project.cursorFocusPath,
            segments: project.cursorFocusPath.segments.map((segment) =>
              segment.binding.kind === 'project'
                ? {
                    ...segment,
                    start: shift(segment.start),
                    end: shift(segment.end),
                    keys: segment.keys.map((key) => ({ ...key, time: shift(key.time) })),
                  }
                : segment
            ),
          },
        }),
    ...(project.textDocuments === undefined
      ? {}
      : { textDocuments: prefixTextDocuments(project.textDocuments, shift) }),
    ...(project.commentDocuments === undefined
      ? {}
      : { commentDocuments: prefixCommentDocuments(project.commentDocuments, shift) }),
  };
  return valid ? next : null;
}

function prefixTextDocuments(
  entries: NonNullable<VideoProject['textDocuments']>,
  shift: (time: number) => number
): NonNullable<VideoProject['textDocuments']> {
  return entries.map((entry) =>
    entry.binding.kind === 'project'
      ? {
          ...entry,
          ...(entry.resultEndLimits === undefined
            ? {}
            : {
                resultEndLimits: entry.resultEndLimits.map((limit) => ({
                  ...limit,
                  end: shift(limit.end),
                })),
              }),
          document: {
            ...entry.document,
            fragments: entry.document.fragments.map((fragment) => ({
              ...fragment,
              start: shift(fragment.start),
              end: shift(fragment.end),
              timingRevision: fragment.timingRevision + 1,
              ...(fragment.words === undefined
                ? {}
                : {
                    words: fragment.words.map((word) => ({
                      ...word,
                      start: shift(word.start),
                      end: shift(word.end),
                    })),
                  }),
            })),
          },
        }
      : entry
  );
}

function prefixCommentDocuments(
  entries: NonNullable<VideoProject['commentDocuments']>,
  shift: (time: number) => number
): NonNullable<VideoProject['commentDocuments']> {
  return entries.map((entry) =>
    entry.binding.kind === 'project'
      ? {
          ...entry,
          annotations: entry.annotations.map((annotation) => ({
            ...annotation,
            anchor:
              annotation.anchor.kind === 'point'
                ? { ...annotation.anchor, time: shift(annotation.anchor.time) }
                : {
                    ...annotation.anchor,
                    start: shift(annotation.anchor.start),
                    end: shift(annotation.anchor.end),
                  },
          })),
          canvasComments: entry.canvasComments.map((comment) => ({
            ...comment,
            ...(comment.start === undefined ? {} : { start: shift(comment.start) }),
            ...(comment.end === undefined ? {} : { end: shift(comment.end) }),
          })),
        }
      : entry
  );
}
