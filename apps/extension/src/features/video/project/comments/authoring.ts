import type { ReviewAnnotation } from '../../review/types';
import { applyVideoProjectMutationPatch } from '../mutation';
import type { VideoProject } from '../types/model';
import { isCommentSourceClip } from './projection';
import type { VideoProjectCommentDocument } from './types';
import {
  hasValidVideoProjectCommentReferences,
  parseVideoProjectCommentDocuments,
} from './validation';

export type VideoProjectCommentEdit =
  | { kind: 'add-note'; note: ReviewAnnotation }
  | { kind: 'note'; id: string; patch: Partial<Omit<ReviewAnnotation, 'id'>> }
  | { kind: 'remove-note'; id: string }
  | { kind: 'remove-document' };

type VideoProjectCommentMutation =
  | { ok: true; project: VideoProject; document: VideoProjectCommentDocument | null }
  | { ok: false; reason: 'stale' | 'locked' | 'invalid' };

/** A hidden source stays editable. A locked bound placement protects the shared authored document. */
export function isVideoProjectCommentEditable(
  project: VideoProject,
  document: VideoProjectCommentDocument
): boolean {
  return (
    document.binding.kind === 'project' ||
    project.clips.every(
      (clip) =>
        !isCommentSourceClip(clip, document.binding) ||
        project.tracks.some((track) => track.id === clip.trackId && !track.locked)
    )
  );
}

/** One initial note belongs to an explicit project or source clock. */
export interface VideoProjectCommentDocumentInput {
  id: string;
  target: { kind: 'project' } | { kind: 'source'; clipId: string };
  note: ReviewAnnotation;
}

/** Adds one explicit clock destination and its first content atomically. */
export function addVideoProjectCommentDocument(
  project: VideoProject,
  args: VideoProjectCommentDocumentInput
): VideoProjectCommentMutation {
  if (project.commentDocuments?.some((document) => document.id === args.id) || !args.note)
    return { ok: false, reason: 'invalid' };
  const target = args.target;
  const clip =
    target.kind === 'source' ? project.clips.find((clip) => clip.id === target.clipId) : undefined;
  if (args.target.kind === 'source' && (!clip || clip.type !== 'VIDEO'))
    return { ok: false, reason: 'invalid' };
  const document: VideoProjectCommentDocument = {
    id: args.id,
    binding:
      clip?.type === 'VIDEO'
        ? {
            kind: 'source',
            assetId: clip.assetId,
            sourceInstanceId: clip.sourceInstanceId ?? clip.id,
          }
        : { kind: 'project' },
    annotations: [args.note],
    canvasComments: [],
  };
  if (!isVideoProjectCommentEditable(project, document)) return { ok: false, reason: 'locked' };
  return admitCommentDocuments(
    project,
    [...(project.commentDocuments ?? []), document],
    document.id
  );
}

/** Applies scalar changes only to the accepted current document identity. */
export function applyVideoProjectCommentEdit(
  project: VideoProject,
  basis: VideoProjectCommentDocument,
  edit: VideoProjectCommentEdit
): VideoProjectCommentMutation {
  if (!project.commentDocuments?.includes(basis)) return { ok: false, reason: 'stale' };
  if (!isVideoProjectCommentEditable(project, basis)) return { ok: false, reason: 'locked' };
  if (edit.kind === 'remove-document')
    return admitCommentDocuments(
      project,
      project.commentDocuments.filter((document) => document !== basis),
      null
    );
  const next = editCommentDocument(basis, edit);
  if (!next) return { ok: false, reason: 'stale' };
  const current = parseVideoProjectCommentDocuments([basis]);
  const normalized = parseVideoProjectCommentDocuments([next]);
  if (!normalized) return { ok: false, reason: 'invalid' };
  if (JSON.stringify(normalized) === JSON.stringify(current))
    return { ok: true, project, document: basis };
  return admitCommentDocuments(
    project,
    project.commentDocuments.map((document) => (document === basis ? normalized[0]! : document)),
    basis.id
  );
}

function editCommentDocument(
  document: VideoProjectCommentDocument,
  edit: Exclude<VideoProjectCommentEdit, { kind: 'remove-document' }>
): VideoProjectCommentDocument | null {
  switch (edit.kind) {
    case 'add-note':
      return { ...document, annotations: [...document.annotations, edit.note] };
    case 'note':
    case 'remove-note':
      if (!document.annotations.some((note) => note.id === edit.id)) return null;
      return {
        ...document,
        annotations:
          edit.kind === 'remove-note'
            ? document.annotations.filter((note) => note.id !== edit.id)
            : document.annotations.map((note) =>
                note.id === edit.id ? { ...note, ...edit.patch } : note
              ),
      };
  }
}

function admitCommentDocuments(
  project: VideoProject,
  documents: VideoProjectCommentDocument[],
  id: string | null
): VideoProjectCommentMutation {
  const parsed = parseVideoProjectCommentDocuments(documents);
  if (!parsed || !hasValidVideoProjectCommentReferences({ ...project, commentDocuments: parsed }))
    return { ok: false, reason: 'invalid' };
  const normalized = id === null ? null : parsed.find((document) => document.id === id)!;
  const retained = documents.map((document) => (document.id === id ? normalized! : document));
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, { commentDocuments: retained }),
    document: normalized,
  };
}
