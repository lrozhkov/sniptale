import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authorizeContentText, isContentTextSender } from './content-text';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../session-tokens';
import { createContentAiEgressAuthority } from '../../../../features/ai/egress-authority';
import { createAiPrivacyProof } from '../../../../features/ai/privacy';
import type { ContentTextStart } from '../../../../contracts/ai/content-text';

const sender: chrome.runtime.MessageSender = {
  id: 'extension',
  documentId: 'page-document',
  frameId: 0,
  tab: { id: 7 } as chrome.tabs.Tab,
  url: 'https://page.test/path',
};
async function issued(): Promise<ContentTextStart> {
  const payload = { markdownData: 'Selected words' };
  const privacyProof = await createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });
  const token = issueLlmSessionToken({
    purpose: 'content-ai-pick',
    sender,
    egressAuthority: await createContentAiEgressAuthority({ payload, privacyProof }),
  });
  if (!token) throw new Error('Fixture token was refused');
  return {
    type: 'start',
    requestId: 'be0e898c-dcdf-4a0c-8e99-83949774b5ab',
    text: payload.markdownData,
    prompt: 'Shorten',
    modelId: 'model',
    approvedProviderId: 'provider',
    approvedModelCode: 'code',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
    privacyProof,
    llmSessionToken: token,
  };
}
beforeEach(() => {
  resetLlmSessionTokensForTests();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
});
afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});
it('requires the exact content sender and consumes a matching content token once', async () => {
  const request = await issued();
  expect(isContentTextSender(sender)).toBe(true);
  for (const patch of [
    { id: 'other' },
    { frameId: -1 },
    { url: 'file:///page.html' },
    { url: 'chrome-extension://extension/apps/extension/src/settings/index.html' },
  ])
    expect(isContentTextSender({ ...sender, ...patch })).toBe(false);
  const missingDocument = { ...sender };
  delete missingDocument.documentId;
  const missingTab = { ...sender };
  delete missingTab.tab;
  expect(isContentTextSender(missingDocument)).toBe(false);
  expect(isContentTextSender(missingTab)).toBe(false);
  await expect(
    authorizeContentText(request, sender, new AbortController().signal)
  ).resolves.toBeUndefined();
  await expect(authorizeContentText(request, sender, new AbortController().signal)).rejects.toThrow(
    'unauthorized'
  );
});
it('refuses altered text and burns a mismatched document capability', async () => {
  const request = await issued();
  const signal = new AbortController().signal;
  await expect(
    authorizeContentText({ ...request, text: 'Undisclosed words' }, sender, signal)
  ).rejects.toThrow('unauthorized');
  await expect(
    authorizeContentText(request, { ...sender, documentId: 'other-document' }, signal)
  ).rejects.toThrow('unauthorized');
  await expect(authorizeContentText(request, sender, signal)).rejects.toThrow('unauthorized');
  await expect(authorizeContentText(await issued(), sender, signal)).resolves.toBeUndefined();
});
it('refuses a cancelled admission without spending its capability', async () => {
  const request = await issued();
  const controller = new AbortController();
  controller.abort();
  await expect(authorizeContentText(request, sender, controller.signal)).rejects.toThrow();
  await expect(
    authorizeContentText(request, sender, new AbortController().signal)
  ).resolves.toBeUndefined();
});
