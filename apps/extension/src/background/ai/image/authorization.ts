import type { ImageJobStart } from '../../../contracts/ai/image';
import { createImageEditorEgressAuthority } from '../../../features/ai/egress-authority';
import { consumeLlmSessionToken, resolveLlmSessionSenderKey } from '../llm/session-tokens';

/** Consumes one payload-bound approval before the job can resolve a provider secret. */
export async function authorizeImageJob(
  request: ImageJobStart,
  sender: chrome.runtime.MessageSender,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  if (!resolveLlmSessionSenderKey('image-editor', sender)) throw new Error('unauthorized');
  const egressAuthority = await createImageEditorEgressAuthority(request);
  signal.throwIfAborted();
  if (
    !consumeLlmSessionToken({
      purpose: 'image-editor',
      sender,
      egressAuthority,
      token: request.llmSessionToken,
    })
  )
    throw new Error('unauthorized');
}
