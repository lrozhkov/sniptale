import { projectReviewTextFragment } from './text-projection';
import type { ReviewTimeSegment } from './time-segment';
import type { ReviewTextFragment } from './text-types';
import type { VideoProjectCommentDocument } from '../project/comments/types';
import { parseVideoProjectCommentDocuments } from '../project/comments/validation';
import type { VideoProjectTextDocument } from '../project/text/types';
import { parseVideoProjectTextDocuments } from '../project/text/validation';
import type { ReviewProjectTimelinePlan } from './project-timeline';
import type { ReviewCaptionSettings, ReviewTextDocument } from './text-types';
import { parseReviewTextDocument } from './text-validation';
import type { ReviewAnnotation, CanvasComment } from './types';
import { parseCanvasComment, parseReviewAnnotation } from './validation';

/** Ordinary editable Native documents preserve the source and project clocks. */
interface ReviewProjectDocumentsPlan {
  textDocuments: VideoProjectTextDocument[];
  commentDocuments: VideoProjectCommentDocument[];
  textDocumentIds: { source: string; result: string; fragments: ReadonlyMap<string, string> };
}

/** Conversion freezes the current result slices; Native owns later montage timing. */
function convertTextPlacements(
  text: ReviewTextDocument | undefined,
  timeline: ReviewProjectTimelinePlan
) {
  const segments: ReviewTimeSegment[] = [
    ...timeline.slices.map((slice) => slice.segment),
    ...timeline.cuts.map((cut) => ({
      kind: 'cut' as const,
      rate: 1,
      sourceStart: cut.edit.start,
      sourceEnd: cut.edit.end,
      resultStart: cut.time,
      resultEnd: cut.time,
    })),
  ].sort((a, b) => a.sourceStart - b.sourceStart);
  const limits: { fragmentId: string; end: number }[] = [];
  const occupied = new Set(text?.fragments.map((fragment) => fragment.id));
  const fragments =
    text?.fragments.flatMap((fragment): ReviewTextFragment[] => {
      if (!fragment.sourceAnchor) return [fragment];
      const { sourceAnchor: _anchor, words, ...base } = fragment;
      const ranges = projectReviewTextFragment(fragment, segments).ranges;
      if (!ranges.length) {
        limits.push({ fragmentId: fragment.id, end: 0 });
        return [{ ...base, ...(words ? { words } : {}) }];
      }
      return ranges.map((range, index) => {
        let id = fragment.id;
        if (index > 0) {
          let suffix = index;
          do {
            id = `text-slice:${suffix++}:${fragment.id}`.slice(0, 256);
          } while (occupied.has(id));
          occupied.add(id);
        }
        const retained = words?.flatMap((word) => {
          const start = Math.max(range.start, word.start);
          const end = Math.min(range.end, word.end);
          return end > start ? [{ ...word, start, end }] : [];
        });
        return { ...base, ...range, id, ...(retained?.length ? { words: retained } : {}) };
      });
    }) ?? [];
  return { fragments, limits };
}

/** Maps authored documents without rendering retired notes or truncating excluded text. */
export function planReviewProjectDocuments(args: {
  timeline: ReviewProjectTimelinePlan;
  text?: ReviewTextDocument;
  captions?: ReviewCaptionSettings;
  annotations: readonly ReviewAnnotation[];
  canvasComments: readonly CanvasComment[];
}): ReviewProjectDocumentsPlan {
  const { timeline } = args;
  const video = timeline.videoClips[0];
  const text = args.text === undefined ? undefined : parseReviewTextDocument(args.text);
  if (
    !video ||
    text === null ||
    timeline.videoClips.some(
      (clip) =>
        clip.assetId !== video.assetId || clip.sourceInstanceId !== timeline.sourceInstanceId
    ) ||
    timeline.audioClips.some(
      (clip) =>
        clip.assetId === video.assetId && clip.sourceInstanceId === timeline.sourceInstanceId
    ) ||
    args.annotations.some((note) => !parseReviewAnnotation(note, timeline.source.duration, true)) ||
    args.canvasComments.some((comment) => !parseCanvasComment(comment, timeline.source.duration))
  )
    throw new Error('Review document conversion is invalid.');
  const binding = {
    kind: 'source' as const,
    assetId: video.assetId,
    sourceInstanceId: timeline.sourceInstanceId,
  };
  const textDocumentIds = {
    source: `${timeline.sourceInstanceId}:text:source`,
    result: `${timeline.sourceInstanceId}:text:result`,
    fragments: new Map<string, string>(),
  };
  const converted = convertTextPlacements(text, timeline);
  const drafts: VideoProjectTextDocument[] = [];
  for (const domain of ['source', 'result'] as const) {
    const fragments = converted.fragments.filter((fragment) => fragment.timeDomain === domain);
    const empty =
      domain === 'result' &&
      !text?.fragments.length &&
      (text !== undefined || args.captions !== undefined);
    if (fragments.length === 0 && !empty) continue;
    for (const fragment of fragments)
      textDocumentIds.fragments.set(fragment.id, textDocumentIds[domain]);
    drafts.push({
      id: textDocumentIds[domain],
      binding: domain === 'source' ? binding : { kind: 'project' },
      ...(domain === 'result'
        ? {
            durationMode: 'project' as const,
            ...(converted.limits.length ? { resultEndLimits: converted.limits } : {}),
          }
        : {}),
      document: { version: 1, fragments },
      ...(args.captions === undefined ? {} : { captions: structuredClone(args.captions) }),
    });
  }
  const textDocuments = parseVideoProjectTextDocuments(drafts);
  const commentDocuments = parseVideoProjectCommentDocuments(
    args.annotations.length || args.canvasComments.length
      ? [
          {
            id: `${timeline.sourceInstanceId}:notes`,
            binding,
            annotations: structuredClone(args.annotations),
            canvasComments: structuredClone(args.canvasComments),
          },
        ]
      : []
  );
  if (!textDocuments || !commentDocuments)
    throw new Error('Review document conversion is invalid.');
  return {
    textDocuments,
    commentDocuments,
    textDocumentIds,
  };
}
