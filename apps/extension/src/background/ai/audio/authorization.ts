import { sameReviewSourceIdentity } from '../../../features/video/review/source-identity';
import { readLibrarySceneSource } from '../../../composition/persistence/projects/library-scene-source';
import { readAssetFile } from '../../../composition/persistence/assets/opfs-store';
import type { VideoWorkspace } from '../../../composition/persistence/review-workspaces/contracts';
import {
  isAudioSourceJobScope,
  isScenarioSpeechScope,
  isProjectAudioSourceJobScope,
  isProjectAudioJobScope,
  isProjectAudioTextJobScope,
  type AudioJobScope,
  type AudioSourceJobScope,
} from '../../../contracts/ai/audio';
import { readVideoProjectAudioSource } from '../../../composition/persistence/projects/audio-source';
import { readVideoProjectTextAudioTarget } from '../../../composition/persistence/projects/text-audio-scope';
import { assertScenarioSpeechScope } from '../../../composition/persistence/scenario/speech-scope';
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

export type AudioJobConsumer = 'gallery' | 'scenario' | 'project';

/** Resolves an owned top-level document; its consumer is bound for the Port lifetime. */
export function getAudioJobSenderConsumer(
  sender: chrome.runtime.MessageSender | undefined
): AudioJobConsumer | null {
  if (!sender?.documentId || sender.id !== chrome.runtime.id || sender.frameId !== 0) return null;
  if (isOwnedExtensionPagePath(sender.url, 'apps/extension/src/gallery/index.html'))
    return 'gallery';
  if (isOwnedExtensionPagePath(sender.url, 'apps/extension/src/scenario-editor/index.html'))
    return 'scenario';
  if (isOwnedExtensionPagePath(sender.url, 'apps/extension/src/video-editor/index.html'))
    return 'project';
  return null;
}

export function isAudioJobSender(
  sender: chrome.runtime.MessageSender | undefined,
  scope?: AudioJobScope
): boolean {
  const consumer = getAudioJobSenderConsumer(sender);
  if (!consumer) return false;
  if (!scope) return true;
  return isScenarioSpeechScope(scope)
    ? consumer === 'scenario'
    : isProjectAudioJobScope(scope)
      ? consumer === 'project'
      : consumer === 'gallery';
}

/** Sender identity permits only the operation family owned by that document. */
export function isAudioJobAllowedForConsumer(
  request: AudioJobStart,
  consumer: AudioJobConsumer
): boolean {
  if (consumer === 'scenario')
    return request.operation === 'speech' && isScenarioSpeechScope(request.scope);
  if (consumer === 'project') return isProjectAudioJobScope(request.scope);
  return !isScenarioSpeechScope(request.scope) && !isProjectAudioJobScope(request.scope);
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
  if (isProjectAudioTextJobScope(request.scope)) {
    if (request.operation !== 'speech' || !('phraseId' in request) || !request.approvedProviderId)
      throw new Error('unauthorized');
    const { fragment } = await readVideoProjectTextAudioTarget(request.scope);
    if (
      request.phraseId !== request.scope.target.fragmentId ||
      request.textRevision !== fragment.revision ||
      request.text !== fragment.text
    )
      throw new Error('stale');
    return;
  }
  if (isProjectAudioSourceJobScope(request.scope)) {
    if (request.operation !== 'transcription' || !request.approvedProviderId)
      throw new Error('unauthorized');
    await readVideoProjectAudioSource(request.scope);
    return;
  }
  if (isScenarioSpeechScope(request.scope)) {
    if (request.operation !== 'speech') throw new Error('unauthorized');
    const savedText = await assertScenarioSpeechScope(request.scope);
    if (savedText !== request.text) throw new Error('stale');
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
      !('phraseId' in request) ||
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
    if (!('phraseId' in request)) throw new Error('stale');
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
