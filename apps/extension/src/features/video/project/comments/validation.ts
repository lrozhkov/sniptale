import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { CANVAS_COMMENT_LIMITS } from '../../review/comments';
import { parseCanvasComment, parseReviewAnnotation } from '../../review/validation';
import type { VideoProject } from '../types/model';
import { MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../validation/primitives';
import type { VideoProjectCommentBinding, VideoProjectCommentDocument } from './types';

const MAX_COMMENT_DOCUMENTS = 2_000;
const MAX_PROJECT_NOTES = 2_000;

function identity(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
  );
}

function parseBinding(value: unknown): VideoProjectCommentBinding | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'project' && Object.keys(value).length === 1) return { kind: 'project' };
  if (
    value['kind'] === 'source' &&
    Object.keys(value).length === 3 &&
    identity(value['assetId']) &&
    identity(value['sourceInstanceId'])
  )
    return {
      kind: 'source',
      assetId: value['assetId'],
      sourceInstanceId: value['sourceInstanceId'],
    };
  return null;
}

function parseDocument(value: unknown): VideoProjectCommentDocument | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    Object.keys(value).some(
      (key) => !['id', 'binding', 'annotations', 'canvasComments'].includes(key)
    ) ||
    !Array.isArray(value['annotations']) ||
    !Array.isArray(value['canvasComments'])
  )
    return null;
  const binding = parseBinding(value['binding']);
  if (!binding) return null;
  const annotations: VideoProjectCommentDocument['annotations'] = [];
  const canvasComments: VideoProjectCommentDocument['canvasComments'] = [];
  const noteIds = new Set<string>();
  const overlayIds = new Set<string>();
  for (const raw of value['annotations']) {
    const note = parseReviewAnnotation(raw, MAX_VIDEO_PROJECT_DURATION_SECONDS, true);
    if (!note || noteIds.has(note.id)) return null;
    noteIds.add(note.id);
    annotations.push(note);
  }
  for (const raw of value['canvasComments']) {
    const overlay = parseCanvasComment(raw, MAX_VIDEO_PROJECT_DURATION_SECONDS);
    if (!overlay || overlayIds.has(overlay.id)) return null;
    overlayIds.add(overlay.id);
    canvasComments.push(overlay);
  }
  return { id: value['id'], binding, annotations, canvasComments };
}

/** Validates the complete Native branch through the shared Gallery note and bubble parsers. */
export function parseVideoProjectCommentDocuments(
  value: unknown
): VideoProjectCommentDocument[] | null {
  if (!Array.isArray(value) || value.length > MAX_COMMENT_DOCUMENTS) return null;
  const documents: VideoProjectCommentDocument[] = [];
  const ids = new Set<string>();
  let notes = 0;
  let overlays = 0;
  for (const raw of value) {
    if (
      !isRecord(raw) ||
      !Array.isArray(raw['annotations']) ||
      !Array.isArray(raw['canvasComments'])
    )
      return null;
    notes += raw['annotations'].length;
    overlays += raw['canvasComments'].length;
    if (notes > MAX_PROJECT_NOTES || overlays > CANVAS_COMMENT_LIMITS.maxComments) return null;
    const document = parseDocument(raw);
    if (!document || ids.has(document.id)) return null;
    ids.add(document.id);
    documents.push(document);
  }
  return documents;
}

/** Missing placements are dormant; a missing or conflicting source asset cannot render. */
export function hasValidVideoProjectCommentReferences(project: VideoProject): boolean {
  return (project.commentDocuments ?? []).every((document) => {
    const binding = document.binding;
    if (binding.kind === 'project') return true;
    const asset = project.assets.find((item) => item.id === binding.assetId);
    if (
      !asset ||
      (asset.type !== 'VIDEO' && asset.type !== 'RECORDING') ||
      project.clips.some(
        (clip) =>
          clip.type === 'VIDEO' &&
          (clip.sourceInstanceId ?? clip.id) === binding.sourceInstanceId &&
          clip.assetId !== binding.assetId
      )
    )
      return false;
    const duration = asset.metadata.duration ?? MAX_VIDEO_PROJECT_DURATION_SECONDS;
    return (
      document.annotations.every((note) => parseReviewAnnotation(note, duration, true) !== null) &&
      document.canvasComments.every((overlay) => parseCanvasComment(overlay, duration) !== null)
    );
  });
}
