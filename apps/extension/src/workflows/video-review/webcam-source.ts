import {
  getMediaLibraryEntry,
  listMediaLibrary,
} from '../../composition/persistence/media-library';
import { recoverProjectMediaPublications } from '../../composition/persistence/projects/asset-publication';
import { resolveReviewAssetBytes } from './asset-bytes';
import { prepareProjectAsset } from '../../composition/persistence/projects';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import { readVideoWorkspace } from '../../composition/persistence/review-workspaces/store';
import { collectReviewAssetReferences } from '../../composition/persistence/review-workspaces/asset-refs';
import type { ReviewSource } from '../../features/video/review/types';
import { inspectReviewVideo, readReviewMediaOriginal } from './source';

/** Discovery is read-only and used only before the first authored camera attachment. */
export async function findReviewWebcam(aggregateId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const snapshot = await readVideoWorkspace(aggregateId);
  signal.throwIfAborted();
  const root = await getMediaLibraryEntry(snapshot?.workspace.sourceMediaId ?? aggregateId);
  if (root?.recordingGroup?.role !== 'display') return null;
  const groupId = root.recordingGroup.groupId;
  const siblings = await listMediaLibrary();
  signal.throwIfAborted();
  return (
    siblings
      .filter(
        (entry) =>
          entry.recordingGroup?.groupId === groupId &&
          entry.recordingGroup.role === 'webcam' &&
          entry.mimeType.startsWith('video/') &&
          entry.lifecycle?.trashedAt === undefined
      )
      .sort(
        (a, b) => a.recordingGroup!.order - b.recordingGroup!.order || a.id.localeCompare(b.id)
      )[0] ?? null
  );
}

/**
 * Freezes bundle bytes under the existing private-asset authority. Attachment must
 * await the history commit; a persisted reference check protects an ambiguous write failure.
 */
export async function attachReviewWebcam(args: {
  aggregateId: string;
  mediaId: string;
  signal: AbortSignal;
  assertCurrentTarget(): void;
  attach(assetId: string, source: ReviewSource): Promise<void>;
}): Promise<void> {
  const { signal } = args;
  const candidate = await findReviewWebcam(args.aggregateId, signal);
  if (!candidate || candidate.id !== args.mediaId) throw new Error('Review webcam is unavailable.');
  const original = await readReviewMediaOriginal(candidate.source);
  signal.throwIfAborted();
  if (!original) throw new Error('Review webcam source is unavailable.');
  const { source } = await inspectReviewVideo(original.file, signal);
  args.assertCurrentTarget();
  if (candidate.source.kind === 'project-asset') {
    await args.attach(`project-asset:${candidate.source.projectAssetId}`, source);
    return;
  }
  const prepared = await prepareProjectAsset(
    original.file,
    source.mimeType,
    candidate.filename,
    undefined,
    undefined,
    { aggregateId: args.aggregateId, clipId: 'webcam' },
    { publishToLibrary: false, originMediaId: candidate.id }
  );
  const reference = `project-asset:${prepared.id}`;
  await withVoiceoverAttachmentLock(reference, async () => {
    let attached = false;
    try {
      signal.throwIfAborted();
      args.assertCurrentTarget();
      await prepared.protect();
      signal.throwIfAborted();
      args.assertCurrentTarget();
      await args.attach(reference, source);
      attached = true;
      await prepared.publish();
    } finally {
      if (!attached) {
        let durable = true;
        try {
          const snapshot = await readVideoWorkspace(args.aggregateId);
          durable = !!snapshot && collectReviewAssetReferences(snapshot.workspace).has(reference);
        } catch {
          // Keep the protected bytes when the write outcome cannot be established.
        }
        if (!durable) await prepared.cancel();
      }
    }
  });
}

/** Explicit Retry repairs the retained publication without reacquiring or rewriting the review. */
export async function recoverReviewWebcam(assetId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!assetId.startsWith('project-asset:')) throw new Error('Invalid webcam reference.');
  const ready = await resolveReviewAssetBytes(assetId);
  signal.throwIfAborted();
  if (ready) return;
  await recoverProjectMediaPublications();
  signal.throwIfAborted();
  if (!(await resolveReviewAssetBytes(assetId))) throw new Error('Review webcam is unavailable.');
}
