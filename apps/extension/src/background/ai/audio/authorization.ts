import { sameReviewSourceIdentity } from '../../../features/video/review/source-identity';
import { readLibrarySceneSource } from '../../../composition/persistence/projects/library-scene-source';
import { readAssetFile } from '../../../composition/persistence/assets/opfs-store';
import type { VideoWorkspace } from '../../../composition/persistence/review-workspaces/contracts';
import {
  isAudioSourceJobScope,
  isProjectAudioSourceJobScope,
  type AudioJobScope,
  type AudioSourceJobScope,
} from '../../../contracts/ai/audio';
import { readVideoProjectAudioSource } from '../../../composition/persistence/projects/audio-source';
import { matchesReviewTextScope } from '../../../features/video/review/text-document';
import { getProjectAsset } from '../../../composition/persistence/projects';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../features/video/review/document';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
import { projectReviewVoiceover } from '../../../features/video/review/voiceover-edits';
import type { AudioJobStart } from '../../../contracts/ai/audio';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import { isOwnedExtensionPagePath } from '../../../platform/navigation/extension-pages/sender-url';

export function isAudioJobSender(
  sender: chrome.runtime.MessageSender | undefined,
  scope?: AudioJobScope
): boolean {
  if (!sender?.documentId || sender.id !== chrome.runtime.id || sender.frameId !== 0) return false;
  const gallery = isOwnedExtensionPagePath(sender.url, 'apps/extension/src/gallery/index.html');
  const project = isOwnedExtensionPagePath(
    sender.url,
    'apps/extension/src/video-editor/index.html'
  );
  return scope ? (isProjectAudioSourceJobScope(scope) ? project : gallery) : gallery || project;
}

async function authorizeOriginalSource(workspace: VideoWorkspace, scope: AudioSourceJobScope) {
  if (workspace.aggregateId !== scope.workspaceId || workspace.sourceAssetId !== scope.assetId)
    throw new Error('unauthorized');
  try {
    const source = await readLibrarySceneSource(workspace.aggregateId, 'video');
    if (!sameReviewSourceIdentity(source.ref, workspace.sourceAssetId, workspace.source))
      throw new Error('unauthorized');
    await readAssetFile(source.ref, source.filename);
  } catch {
    throw new Error('unauthorized');
  }
}

/** Sender identity alone never authorizes an asset: durable selection is rechecked before POST. */
export async function authorizeAudioJob(request: AudioJobStart): Promise<void> {
  if (isProjectAudioSourceJobScope(request.scope)) {
    if (request.operation !== 'transcription' || !request.approvedProviderId)
      throw new Error('unauthorized');
    await readVideoProjectAudioSource(request.scope);
    return;
  }
  const snapshot = await readVideoWorkspace(request.scope.workspaceId);
  const workspace = snapshot?.workspace;
  if (!workspace || workspace.revision !== request.scope.workspaceRevision)
    throw new Error('stale');
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewDocumentBaseline(workspace)
  );
  const scope = request.scope;
  if (!isAudioSourceJobScope(scope)) {
    const fragment = document.advancedContent.text?.fragments.find(
      (entry) => entry.id === scope.target.fragmentId
    );
    const segments = buildReviewTimeMap(workspace.source.duration, document.edits);
    const limit =
      scope.timeDomain === 'source' ? workspace.source.duration : (segments.at(-1)?.resultEnd ?? 0);
    if (
      request.operation !== 'speech' ||
      !matchesReviewTextScope(fragment, scope) ||
      request.phraseId !== scope.target.fragmentId ||
      request.textRevision !== scope.textRevision ||
      fragment?.text !== request.text ||
      scope.end > limit
    )
      throw new Error('stale');
    return;
  }
  const target = scope.target;
  const timeMap = buildReviewTimeMap(workspace.source.duration, document.edits);
  const clip =
    target.kind === 'voiceover'
      ? document.advancedContent.audio.voiceover.find((entry) => entry.id === target.clipId)
      : undefined;
  if (target.kind === 'voiceover' && (!clip || clip.assetId !== scope.assetId))
    throw new Error('unauthorized');
  const ranges =
    target.kind === 'original'
      ? request.operation === 'transcription'
        ? [{ start: 0, end: workspace.source.duration }]
        : timeMap
            .filter((segment) => segment.kind !== 'cut')
            .map((segment) => ({ start: segment.sourceStart, end: segment.sourceEnd }))
      : projectReviewVoiceover([clip!], timeMap)
          .map((slice) => ({
            start: slice.sourceOffset,
            end: slice.sourceOffset + slice.duration * (slice.playbackRate ?? 1),
          }))
          .sort((left, right) => left.start - right.start);
  const tolerance = target.kind === 'original' ? 0 : 0.000001;
  let covered = scope.nativeStart;
  for (const range of ranges) {
    if (range.start > covered + tolerance) break;
    if (range.end > covered) covered = range.end;
  }
  if (covered < scope.nativeEnd - tolerance) throw new Error('unauthorized');
  if (target.kind === 'original') await authorizeOriginalSource(workspace, scope);
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
      phrase.start !== scope.nativeStart ||
      phrase.end !== scope.nativeEnd
    )
      throw new Error('stale');
  }
}
