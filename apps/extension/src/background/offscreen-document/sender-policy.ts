import {
  createCapabilityContext,
  isCapabilityContextAuthorized,
  resolveCapabilityOrigin,
  type CapabilityContext,
} from '@sniptale/platform/security/capability-context';
import { resolveExtensionDocumentSenderUrl } from '../../platform/runtime-messaging/document-sender';

const OFFSCREEN_DOCUMENT_PATH = 'apps/extension/src/offscreen/offscreen.html';
const OFFSCREEN_RUNTIME_CAPABILITY_WINDOW_MS = 1_000;

export function isTrustedOffscreenRuntimeSender(sender: chrome.runtime.MessageSender): boolean {
  return hasOffscreenRuntimeCapability(sender);
}

export function hasOffscreenRuntimeCapability(
  sender: chrome.runtime.MessageSender,
  nowEpochMs = Date.now()
): boolean {
  const capabilityContext = resolveOffscreenRuntimeCapabilityContext(sender, nowEpochMs);
  return (
    capabilityContext !== null &&
    isCapabilityContextAuthorized(capabilityContext, {
      origin: resolveCapabilityOrigin(sender.url),
      scope: 'offscreen:runtime',
      token: capabilityContext.token,
      nowEpochMs,
    })
  );
}

export function resolveOffscreenRuntimeCapabilityContext(
  sender: chrome.runtime.MessageSender,
  nowEpochMs = Date.now()
): CapabilityContext | null {
  const senderUrl = resolveExtensionDocumentSenderUrl(sender, OFFSCREEN_DOCUMENT_PATH);
  if (!senderUrl) return null;
  return createCapabilityContext({
    expiresAtEpochMs: nowEpochMs + OFFSCREEN_RUNTIME_CAPABILITY_WINDOW_MS,
    origin: resolveCapabilityOrigin(senderUrl),
    scopes: ['offscreen:runtime'],
    token: sender.documentId ?? senderUrl,
  });
}
