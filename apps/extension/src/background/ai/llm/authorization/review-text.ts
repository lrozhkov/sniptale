import {
  isProjectReviewTextScope,
  type ReviewTextStart,
} from '../../../../contracts/ai/review-text';
import { isOwnedExtensionPagePath } from '../../../../platform/navigation/extension-pages/sender-url';
import { isCurrentVideoProjectSnapshot } from '../../../../composition/persistence/projects/revision';
import { getVideoProject } from '../../../../composition/persistence/projects';
import { captureVideoProjectTextRewriteContext } from '../../../../features/video/project/text/rewrite-context';
import { createReviewTextEgressAuthority } from '../../../../features/ai/egress-authority';
import { consumeLlmSessionToken, resolveLlmSessionSenderKey } from '../session-tokens';
import { readVideoWorkspace } from '../../../../composition/persistence/review-workspaces/store';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../../features/video/review/document';
import { buildReviewTimeMap } from '../../../../features/video/review/timeline';
import { projectReviewTextFragment } from '../../../../features/video/review/text-projection';

export function isReviewTextSender(
  sender: chrome.runtime.MessageSender | undefined
): sender is chrome.runtime.MessageSender {
  return !!sender && resolveLlmSessionSenderKey('review-text', sender) !== null;
}

export async function authorizeReviewText(
  request: ReviewTextStart,
  sender: chrome.runtime.MessageSender,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  if (!isReviewTextSender(sender)) throw new Error('unauthorized');
  const egressAuthority = await createReviewTextEgressAuthority(request);
  signal.throwIfAborted();
  if (
    !consumeLlmSessionToken({
      purpose: 'review-text',
      egressAuthority,
      sender,
      token: request.llmSessionToken,
    })
  )
    throw new Error('unauthorized');
  if (
    isProjectReviewTextScope(request.scope) !==
    isOwnedExtensionPagePath(sender.url, 'apps/extension/src/video-editor/index.html')
  )
    throw new Error('unauthorized');
  await assertReviewTextJobScope(request, signal);
}

/** Repeated before POST: page ownership does not authorize vanished or changed source text. */
export async function assertReviewTextJobScope(
  request: ReviewTextStart,
  signal: AbortSignal
): Promise<void> {
  if (isProjectReviewTextScope(request.scope)) {
    const scope = request.scope;
    const saved = await getVideoProject(scope.projectId);
    signal.throwIfAborted();
    if (
      saved.status !== 'ready' ||
      saved.lifecycle?.trashedAt !== undefined ||
      saved.workspaceRevision !== scope.projectRevision ||
      saved.project.id !== scope.projectId ||
      saved.project.updatedAt !== scope.projectUpdatedAt
    )
      throw new Error('stale');
    let expected;
    try {
      expected = captureVideoProjectTextRewriteContext(
        saved.project,
        scope.documentId,
        request.context.fragments.map((fragment) => fragment.id),
        request.context
      );
    } catch {
      throw new Error('stale');
    }
    if (JSON.stringify(expected) !== JSON.stringify(request.context)) throw new Error('stale');
    const current = await isCurrentVideoProjectSnapshot(saved.project, saved.workspaceRevision);
    signal.throwIfAborted();
    if (!current) throw new Error('stale');
    return;
  }
  const saved = await readVideoWorkspace(request.scope.workspaceId);
  signal.throwIfAborted();
  const workspace = saved?.workspace;
  if (
    !workspace ||
    workspace.aggregateId !== request.scope.workspaceId ||
    workspace.revision !== request.scope.workspaceRevision
  )
    throw new Error('stale');
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewDocumentBaseline(workspace)
  );
  const fragments = document.advancedContent.text?.fragments ?? [];
  const segments = buildReviewTimeMap(workspace.source.duration, document.edits);
  if (
    request.context.window.end > (segments.at(-1)?.resultEnd ?? 0) ||
    (request.context.wholeDocument && request.context.fragments.length !== fragments.length)
  )
    throw new Error('stale');
  for (const disclosed of request.context.fragments) {
    const fragment = fragments.find((entry) => entry.id === disclosed.id);
    if (!fragment || fragment.text !== disclosed.text || fragment.language !== disclosed.language)
      throw new Error('stale');
    const projected = projectReviewTextFragment(fragment, segments);
    if (
      projected.excludedFromResult ||
      projected.partiallyExcluded ||
      projected.ranges[0]?.start !== disclosed.start ||
      projected.ranges.at(-1)?.end !== disclosed.end ||
      (disclosed.ranges !== undefined &&
        JSON.stringify(disclosed.ranges) !== JSON.stringify(projected.ranges))
    )
      throw new Error('stale');
  }
}
