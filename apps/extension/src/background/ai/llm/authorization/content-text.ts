import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentTextStart } from '../../../../contracts/ai/content-text';
import { isOwnedExtensionPagePath } from '../../../../platform/navigation/extension-pages/sender-url';
import { authorizeContentLlmRoute } from './egress';

/** Admits a content document or the existing saved-page viewer, with a document-bound token. */
export function isContentTextSender(
  sender: chrome.runtime.MessageSender | undefined
): sender is chrome.runtime.MessageSender {
  if (
    !sender ||
    sender.id !== chrome.runtime.id ||
    !sender.documentId ||
    !Number.isInteger(sender.tab?.id) ||
    (sender.tab?.id ?? -1) < 0 ||
    !Number.isInteger(sender.frameId) ||
    (sender.frameId ?? -1) < 0 ||
    !sender.url
  )
    return false;
  try {
    const protocol = new URL(sender.url).protocol;
    return (
      protocol === 'http:' ||
      protocol === 'https:' ||
      isOwnedExtensionPagePath(sender.url, 'apps/extension/src/web-snapshot-viewer/index.html')
    );
  } catch {
    return false;
  }
}

/** Uses the existing content privacy, payload limits and one-shot capability authority. */
export async function authorizeContentText(
  request: ContentTextStart,
  sender: chrome.runtime.MessageSender,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  if (!isContentTextSender(sender)) throw new Error('unauthorized');
  const result = await authorizeContentLlmRoute({
    sender,
    message: {
      type: MessageType.PROCESS_WITH_LLM,
      markdownData: request.text,
      prompt: request.prompt,
      modelId: request.modelId,
      llmSessionToken: request.llmSessionToken,
      privacyProof: request.privacyProof,
    },
  });
  signal.throwIfAborted();
  if (!result.authorized) throw new Error('unauthorized');
}
