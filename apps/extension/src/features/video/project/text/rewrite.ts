import type { ReviewTextProposal } from '../../../../contracts/ai/review-text';
import {
  applyReviewTextRewrite,
  matchesReviewTextRewriteBasis,
  type ReviewTextRewriteBasis,
} from '../../review/text-rewrite';
import { applyVideoProjectMutationPatch } from '../mutation';
import type { VideoProject } from '../types/model';
import { captureVideoProjectTextRewriteContext } from './rewrite-context';
import type { VideoProjectTextBinding, VideoProjectTextDocument } from './types';
import { hasValidVideoProjectTextReferences, parseVideoProjectTextDocuments } from './validation';

export interface VideoProjectTextRewriteBasis extends ReviewTextRewriteBasis {
  projectId: string;
  projectCreatedAt: number;
  documentId: string;
  binding: VideoProjectTextBinding;
}

/** Captures detached authored text and exact placement before the caller saves or requests AI. */
export function captureVideoProjectTextRewrite(
  project: VideoProject,
  documentId: string,
  ids: readonly string[],
  options: Parameters<typeof captureVideoProjectTextRewriteContext>[3]
): VideoProjectTextRewriteBasis {
  const context = captureVideoProjectTextRewriteContext(project, documentId, ids, options);
  const entry = project.textDocuments!.find((document) => document.id === documentId)!;
  return structuredClone({
    projectId: project.id,
    projectCreatedAt: project.createdAt,
    documentId,
    binding: entry.binding,
    context,
    fragments: ids.map((id) => entry.document.fragments.find((fragment) => fragment.id === id)!),
  });
}

/** Appearance can change independently; identity, authored content and exact placement cannot. */
export function matchesVideoProjectTextRewriteBasis(
  project: VideoProject,
  basis: VideoProjectTextRewriteBasis
): boolean {
  if (project.id !== basis.projectId || project.createdAt !== basis.projectCreatedAt) return false;
  const entry = project.textDocuments?.find((document) => document.id === basis.documentId);
  if (
    !entry ||
    JSON.stringify(entry.binding) !== JSON.stringify(basis.binding) ||
    !matchesReviewTextRewriteBasis(entry.document, basis)
  )
    return false;
  try {
    const context = captureVideoProjectTextRewriteContext(
      project,
      entry.id,
      basis.fragments.map((fragment) => fragment.id),
      basis.context
    );
    return JSON.stringify(context) === JSON.stringify(basis.context);
  } catch {
    return false;
  }
}

/** Applies one atomic text edit; explicit source retiming creates independent project placement. */
export function applyVideoProjectTextRewrite(
  project: VideoProject,
  basis: VideoProjectTextRewriteBasis,
  proposal: ReviewTextProposal,
  mode: 'replace' | 'variant',
  createId: () => string
):
  | { ok: true; project: VideoProject; changed: boolean; documents: VideoProjectTextDocument[] }
  | { ok: false; reason: 'stale' | 'invalid' } {
  if (!matchesVideoProjectTextRewriteBasis(project, basis)) return { ok: false, reason: 'stale' };
  const entry = project.textDocuments!.find((document) => document.id === basis.documentId)!;
  const applied = applyReviewTextRewrite(entry.document, basis, proposal, mode, createId);
  if (!applied.ok) return applied;
  if (!applied.changed) return { ok: true, project, changed: false, documents: [] };
  let changed: VideoProjectTextDocument[];
  if (entry.binding.kind === 'source' && basis.context.changeIntervals) {
    changed = [
      {
        ...entry,
        document: {
          ...applied.document,
          fragments: applied.document.fragments.filter(
            (fragment) => fragment.timeDomain === 'source'
          ),
        },
      },
      {
        id: createId(),
        binding: { kind: 'project' },
        document: {
          ...applied.document,
          fragments: applied.document.fragments.filter(
            (fragment) => fragment.timeDomain === 'result'
          ),
        },
        ...(entry.captions ? { captions: structuredClone(entry.captions) } : {}),
      },
    ];
  } else changed = [{ ...entry, document: applied.document }];
  const documents = project.textDocuments!.flatMap((document) =>
    document === entry ? changed : [document]
  );
  if (!parseVideoProjectTextDocuments(documents)) return { ok: false, reason: 'invalid' };
  const next = { ...project, textDocuments: documents };
  if (!hasValidVideoProjectTextReferences(next)) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    project: applyVideoProjectMutationPatch(project, { textDocuments: documents }),
    changed: true,
    documents: changed,
  };
}
