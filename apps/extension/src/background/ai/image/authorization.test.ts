import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authorizeImageJob } from './authorization';
import { createImageEditorEgressAuthority } from '../../../features/ai/egress-authority';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../llm/session-tokens';
import type { ImageJobStart } from '../../../contracts/ai/image';

const owner = {
  id: 'extension-id',
  frameId: 0,
  documentId: 'editor-doc',
  url: 'chrome-extension://extension-id/apps/extension/src/editor/index.html',
};
const uuid = 'fdd43bfc-2c5b-416e-91b2-d2c2cc820ac7';
const request: ImageJobStart = {
  type: 'start',
  requestId: uuid,
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'code',
  llmSessionToken: '',
  scope: { documentId: 'doc', snapshotId: uuid, sessionId: uuid },
  context: {
    version: 1,
    intention: 'new-image',
    prompt: 'A square',
    images: [],
    parameters: { variants: 1 },
  },
};
beforeEach(() => {
  resetLlmSessionTokensForTests();
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension-id',
      getURL: (path: string) => `chrome-extension://extension-id/${path}`,
    },
  });
});
afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});

async function approve() {
  const egressAuthority = await createImageEditorEgressAuthority(request);
  const token = issueLlmSessionToken({ purpose: 'image-editor', sender: owner, egressAuthority });
  if (!token) throw new Error('Expected approval token');
  return { ...request, llmSessionToken: token };
}

it('consumes the exact image approval only once', async () => {
  const approved = await approve();
  await expect(
    authorizeImageJob(approved, owner, new AbortController().signal)
  ).resolves.toBeUndefined();
  await expect(authorizeImageJob(approved, owner, new AbortController().signal)).rejects.toThrow(
    'unauthorized'
  );
});
it('rejects changes to the approved content or destination before resolving secrets', async () => {
  const approved = await approve();
  await expect(
    authorizeImageJob(
      { ...approved, context: { ...approved.context, prompt: 'Another image' } },
      owner,
      new AbortController().signal
    )
  ).rejects.toThrow('unauthorized');
  const next = await approve();
  await expect(
    authorizeImageJob({ ...next, approvedProviderId: 'other' }, owner, new AbortController().signal)
  ).rejects.toThrow('unauthorized');
});
it('rejects other documents and cancellation before authority hashing', async () => {
  const approved = await approve();
  await expect(
    authorizeImageJob(approved, { ...owner, documentId: 'foreign' }, new AbortController().signal)
  ).rejects.toThrow('unauthorized');
  const controller = new AbortController();
  controller.abort();
  await expect(authorizeImageJob(await approve(), owner, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
