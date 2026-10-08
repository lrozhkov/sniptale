import { readLibrarySceneSource } from '../../../composition/persistence/projects/library-scene-source';
import { readAssetFile } from '../../../composition/persistence/assets/opfs-store';
import type { VideoWorkspace } from '../../../composition/persistence/review-workspaces/contracts';
import type { AudioJobScope } from '../../../contracts/ai/audio';
import { getProjectAsset } from '../../../composition/persistence/projects';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { projectReviewVoiceover } from '../../../features/video/review/voiceover-edits';
import type { AudioJobStart } from '../../../contracts/ai/audio';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import { isOwnedExtensionPagePath } from '../../../platform/navigation/extension-pages/sender-url';

export function isAudioJobSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  return (
    !!sender?.documentId &&
    sender.id === chrome.runtime.id &&
    sender.frameId === 0 &&
    isOwnedExtensionPagePath(sender.url, 'apps/extension/src/gallery/index.html')
  );
}

async function authorizeOriginalSource(workspace: VideoWorkspace, scope: AudioJobScope) {
  if (workspace.aggregateId !== scope.workspaceId || workspace.sourceAssetId !== scope.assetId)
    throw new Error('unauthorized');
  try {
    const source = await readLibrarySceneSource(workspace.aggregateId, 'video');
    if (
      source.ref.assetId !== workspace.sourceAssetId ||
      source.ref.size !== workspace.source.size ||
      // Inspection adds codec parameters; immutable storage records the container MIME.
      source.ref.mimeType.split(';', 1)[0]?.trim().toLowerCase() !==
        workspace.source.mimeType.split(';', 1)[0]?.trim().toLowerCase()
    )
      throw new Error('unauthorized');
    await readAssetFile(source.ref, source.filename);
  } catch {
    throw new Error('unauthorized');
  }
}

/** Sender identity alone never authorizes an asset: durable selection is rechecked before POST. */
export async function authorizeAudioJob(request: AudioJobStart): Promise<void> {
  const snapshot = await readVideoWorkspace(request.scope.workspaceId);
  const workspace = snapshot?.workspace;
  if (!workspace || workspace.revision !== request.scope.workspaceRevision)
    throw new Error('stale');
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewAdvancedContentBaseline(workspace.advanced)
  );
  const target = request.scope.target;
  const timeMap = buildReviewTimeMap(workspace.source.duration, document.edits);
  const clip =
    target.kind === 'voiceover'
      ? document.advancedContent.audio.voiceover.find((entry) => entry.id === target.clipId)
      : undefined;
  if (target.kind === 'voiceover' && (!clip || clip.assetId !== request.scope.assetId))
    throw new Error('unauthorized');
  const ranges =
    target.kind === 'original'
      ? timeMap
          .filter((segment) => segment.kind !== 'cut')
          .map((segment) => ({ start: segment.sourceStart, end: segment.sourceEnd }))
      : projectReviewVoiceover([clip!], timeMap)
          .map((slice) => ({
            start: slice.sourceOffset,
            end: slice.sourceOffset + slice.duration * (slice.playbackRate ?? 1),
          }))
          .sort((left, right) => left.start - right.start);
  const tolerance = target.kind === 'original' ? 0 : 0.000001;
  let covered = request.scope.nativeStart;
  for (const range of ranges) {
    if (range.start > covered + tolerance) break;
    if (range.end > covered) covered = range.end;
  }
  if (covered < request.scope.nativeEnd - tolerance) throw new Error('unauthorized');
  if (target.kind === 'original') await authorizeOriginalSource(workspace, request.scope);
  else if (
    !clip!.assetId.startsWith('project-asset:') ||
    (await getProjectAsset(clip!.assetId.slice('project-asset:'.length))).status !== 'ready'
  )
    throw new Error('unauthorized');
  if (request.operation === 'speech') {
    const transcript =
      target.kind === 'original'
        ? document.advancedContent.audio.originalSpeech?.transcript
        : clip?.transcript;
    const phrase = transcript?.phrases.find((entry) => entry.id === request.phraseId);
    if (
      !phrase ||
      phrase.text !== request.text ||
      phrase.revision !== request.textRevision ||
      phrase.start !== request.scope.nativeStart ||
      phrase.end !== request.scope.nativeEnd
    )
      throw new Error('stale');
  }
}
