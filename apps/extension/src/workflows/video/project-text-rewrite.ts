import type { ReviewTextProposal, ReviewTextStart } from '../../contracts/ai/review-text';
import { parseReviewTextProposal } from '../../contracts/ai/review-text';
import { getVideoProject } from '../../composition/persistence/projects';
import { isCurrentVideoProjectSnapshot } from '../../composition/persistence/projects/revision';
import { createReviewTextEgressAuthority } from '../../features/ai/egress-authority';
import type { VideoProject } from '../../features/video/project/types/model';
import type { VideoProjectTextDocument } from '../../features/video/project/text/types';
import { parseVideoProjectTextDocuments } from '../../features/video/project/text/validation';
import {
  applyVideoProjectTextRewrite,
  captureVideoProjectTextRewrite,
  matchesVideoProjectTextRewriteBasis,
  type VideoProjectTextRewriteBasis,
} from '../../features/video/project/text/rewrite';
import { requestLlmSessionToken } from '../ai-session/llm-session';
import { runReviewTextJob } from '../video-review/text-rewrite-client';

/** The mounted editor owns history, mutation, Save serialization and conflict recovery. */
export interface ProjectTextRewriteAccess {
  getProject(): VideoProject | null;
  save(): Promise<void>;
  update(updater: (project: VideoProject) => VideoProject): void;
}
type RewriteModel = Pick<
  ReviewTextStart,
  'modelId' | 'approvedProviderId' | 'approvedDestination' | 'approvedModelCode'
>;
interface SavedProject {
  project: VideoProject;
  workspaceRevision: number;
}
interface ProjectTextRewritePreview {
  basis: VideoProjectTextRewriteBasis;
  localProject: string;
  proposal?: ReviewTextProposal;
  admitted?: SavedProject;
  generatedIds?: string[];
  /** Accepted local text survives Save failure; retry only acknowledges these exact documents. */
  receipt?: { mode: 'replace' | 'variant'; documents: VideoProjectTextDocument[] };
}

function localProjectKey(project: VideoProject): string {
  // A successful mounted Save can acknowledge a newer timestamp without changing authored data.
  return JSON.stringify({ ...project, updatedAt: 0 });
}

/** Captures the disclosure before Save can flush pending work or acknowledge its timestamp. */
export function captureProjectTextRewrite(
  access: ProjectTextRewriteAccess,
  documentId: string,
  ids: readonly string[],
  options: Parameters<typeof captureVideoProjectTextRewrite>[3]
): ProjectTextRewritePreview {
  const project = access.getProject();
  if (!project) throw new Error('stale');
  return {
    basis: captureVideoProjectTextRewrite(project, documentId, ids, options),
    localProject: localProjectKey(project),
  };
}

function assertLocal(access: ProjectTextRewriteAccess, preview: ProjectTextRewritePreview) {
  const current = access.getProject();
  if (
    !current ||
    localProjectKey(current) !== preview.localProject ||
    !matchesVideoProjectTextRewriteBasis(current, preview.basis)
  )
    throw new Error('stale');
  return current;
}

function sameSavedProject(left: SavedProject, right: SavedProject): boolean {
  return (
    left.workspaceRevision === right.workspaceRevision &&
    JSON.stringify(left.project) === JSON.stringify(right.project)
  );
}

async function readCurrentSaved(
  projectId: string,
  signal: AbortSignal,
  expected?: SavedProject
): Promise<SavedProject> {
  signal.throwIfAborted();
  const saved = await getVideoProject(projectId);
  signal.throwIfAborted();
  if (
    saved.status !== 'ready' ||
    saved.project.id !== projectId ||
    saved.lifecycle?.trashedAt !== undefined ||
    (expected && !sameSavedProject(saved, expected))
  )
    throw new Error('stale');
  const current = await isCurrentVideoProjectSnapshot(saved.project, saved.workspaceRevision);
  signal.throwIfAborted();
  if (!current) throw new Error('stale');
  return { project: saved.project, workspaceRevision: saved.workspaceRevision };
}

/** Uses one explicit paid job; the existing background independently admits consent and freshness. */
export async function generateProjectTextRewrite(
  access: ProjectTextRewriteAccess,
  preview: ProjectTextRewritePreview,
  model: RewriteModel,
  signal: AbortSignal
): Promise<ProjectTextRewritePreview> {
  signal.throwIfAborted();
  if (preview.proposal || preview.receipt) throw new Error('invalid-request');
  assertLocal(access, preview);
  const approved = structuredClone(model);
  await access.save();
  signal.throwIfAborted();
  assertLocal(access, preview);
  const saved = await readCurrentSaved(preview.basis.projectId, signal);
  assertLocal(access, preview);
  if (!matchesVideoProjectTextRewriteBasis(saved.project, preview.basis)) throw new Error('stale');
  const input = {
    ...approved,
    context: structuredClone(preview.basis.context),
    scope: {
      kind: 'project-text' as const,
      projectId: saved.project.id,
      projectRevision: saved.workspaceRevision,
      projectUpdatedAt: saved.project.updatedAt,
      documentId: preview.basis.documentId,
    },
  };
  const authority = await createReviewTextEgressAuthority(input);
  signal.throwIfAborted();
  assertLocal(access, preview);
  const llmSessionToken = await requestLlmSessionToken('review-text', authority);
  signal.throwIfAborted();
  await readCurrentSaved(preview.basis.projectId, signal, saved);
  assertLocal(access, preview);
  const result = await runReviewTextJob(
    { ...input, type: 'start', requestId: crypto.randomUUID(), llmSessionToken },
    signal
  );
  signal.throwIfAborted();
  await readCurrentSaved(preview.basis.projectId, signal, saved);
  assertLocal(access, preview);
  const proposal = parseReviewTextProposal(result, preview.basis.context);
  if (!proposal) throw new Error('invalid-response');
  return { ...preview, proposal, admitted: structuredClone(saved) };
}

function receiptMatches(project: VideoProject | null, preview: ProjectTextRewritePreview) {
  if (
    !project ||
    project.id !== preview.basis.projectId ||
    project.createdAt !== preview.basis.projectCreatedAt ||
    !preview.receipt
  )
    return false;
  const entries = preview.receipt.documents.map((document) =>
    project.textDocuments?.find((entry) => entry.id === document.id)
  );
  const parsed = parseVideoProjectTextDocuments(entries);
  return (
    parsed !== null &&
    JSON.stringify(parsed) ===
      JSON.stringify(parseVideoProjectTextDocuments(preview.receipt.documents))
  );
}

function acceptLocalRewrite(
  access: ProjectTextRewriteAccess,
  preview: ProjectTextRewritePreview,
  proposal: ReviewTextProposal,
  mode: 'replace' | 'variant'
) {
  const current = assertLocal(access, preview);
  const generatedIds = preview.generatedIds ?? [];
  preview.generatedIds = generatedIds;
  let accepted = false;
  access.update((project) => {
    if (project !== current) throw new Error('stale');
    let index = 0;
    const result = applyVideoProjectTextRewrite(project, preview.basis, proposal, mode, () => {
      const id = generatedIds[index] ?? crypto.randomUUID();
      generatedIds[index++] = id;
      return id;
    });
    if (!result.ok) throw new Error(result.reason);
    preview.receipt = {
      mode,
      documents: structuredClone(
        result.changed
          ? result.documents
          : [project.textDocuments!.find((entry) => entry.id === preview.basis.documentId)!]
      ),
    };
    accepted = true;
    return result.project;
  });
  if (!accepted) throw new Error('stale');
}

/** Applies one local edit, then confirms Save. A retry never inserts text or requests AI again. */
export async function applyProjectTextRewrite(
  access: ProjectTextRewriteAccess,
  preview: ProjectTextRewritePreview,
  signal: AbortSignal,
  mode: 'replace' | 'variant'
): Promise<void> {
  signal.throwIfAborted();
  if (!preview.proposal || !preview.admitted || (preview.receipt && preview.receipt.mode !== mode))
    throw new Error('invalid-request');
  if (!preview.receipt) {
    assertLocal(access, preview);
    await readCurrentSaved(preview.basis.projectId, signal, preview.admitted);
    assertLocal(access, preview);
    acceptLocalRewrite(access, preview, preview.proposal, mode);
  }
  signal.throwIfAborted();
  if (!receiptMatches(access.getProject(), preview)) throw new Error('stale');
  const beforeSave = await readCurrentSaved(preview.basis.projectId, signal);
  if (!receiptMatches(access.getProject(), preview)) throw new Error('stale');
  // An acknowledged edit must not flush newer buffers or overwrite a restored canonical head.
  if (receiptMatches(beforeSave.project, preview)) return;
  if (!sameSavedProject(beforeSave, preview.admitted)) throw new Error('stale');
  await access.save();
  signal.throwIfAborted();
  const saved = await readCurrentSaved(preview.basis.projectId, signal);
  if (!receiptMatches(saved.project, preview) || !receiptMatches(access.getProject(), preview))
    throw new Error('stale');
}
