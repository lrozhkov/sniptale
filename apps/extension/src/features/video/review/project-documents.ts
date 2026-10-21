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
  textDocumentIds: { source: string; result: string };
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
  };
  const drafts: VideoProjectTextDocument[] = [];
  for (const domain of ['source', 'result'] as const) {
    const fragments = text?.fragments.filter((fragment) => fragment.timeDomain === domain) ?? [];
    const empty =
      domain === 'result' &&
      !text?.fragments.length &&
      (text !== undefined || args.captions !== undefined);
    if (fragments.length === 0 && !empty) continue;
    drafts.push({
      id: textDocumentIds[domain],
      binding: domain === 'source' ? binding : { kind: 'project' },
      ...(domain === 'result' ? { durationMode: 'project' as const } : {}),
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
