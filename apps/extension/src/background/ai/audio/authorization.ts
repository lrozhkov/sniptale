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
  const clip = document.advancedContent.audio.voiceover.find(
    (entry) => entry.id === request.scope.clipId
  );
  if (!clip || clip.assetId !== request.scope.assetId) throw new Error('unauthorized');
  const slices = projectReviewVoiceover(
    [clip],
    buildReviewTimeMap(workspace.source.duration, document.edits)
  );
  const ranges = slices
    .map((slice) => ({
      start: slice.sourceOffset,
      end: slice.sourceOffset + slice.duration * (slice.playbackRate ?? 1),
    }))
    .sort((left, right) => left.start - right.start);
  let covered = request.scope.nativeStart;
  for (const range of ranges) {
    if (range.start > covered + 0.000001) break;
    if (range.end > covered) covered = range.end;
  }
  if (covered < request.scope.nativeEnd - 0.000001) throw new Error('unauthorized');
  if (
    !clip.assetId.startsWith('project-asset:') ||
    (await getProjectAsset(clip.assetId.slice('project-asset:'.length))).status !== 'ready'
  )
    throw new Error('unauthorized');
  if (request.operation === 'speech') {
    const phrase = clip.transcript?.phrases.find((entry) => entry.id === request.phraseId);
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
