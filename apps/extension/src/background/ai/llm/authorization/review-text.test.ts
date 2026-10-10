import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeReviewText, assertReviewTextJobScope, isReviewTextSender } from './review-text';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../session-tokens';
import { createReviewTextEgressAuthority } from '../../../../features/ai/egress-authority';
import type { ReviewTextStart } from '../../../../contracts/ai/review-text';
import { createQuickEditAdvancedState } from '../../../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../../../composition/persistence/review-workspaces/contracts';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: read,
}));
const sender = {
  id: 'extension',
  frameId: 0,
  documentId: 'gallery-document',
  url: 'chrome-extension://extension/apps/extension/src/gallery/index.html',
};
const request: ReviewTextStart = {
  type: 'start',
  requestId: 'be0e898c-dcdf-4a0c-8e99-83949774b5ab',
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'code',
  llmSessionToken: 'unissued',
  scope: { workspaceId: 'video', workspaceRevision: 1 },
  context: {
    version: 1,
    prompt: 'Shorten',
    mode: 'phrases',
    wholeDocument: true,
    changeIntervals: false,
    resegment: false,
    window: { start: 1, end: 3 },
    fragments: [{ id: 'text', text: 'Current words', start: 1, end: 3 }],
  },
};
function fixture(): VideoWorkspaceSnapshot {
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'text',
        text: 'Current words',
        originalText: '',
        revision: 0,
        timingRevision: 0,
        timeDomain: 'source',
        start: 1,
        end: 3,
        alignment: 'manual',
        showInVideo: true,
      },
    ],
  };
  return {
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      source: { duration: 10, width: 640, height: 360, size: 5, mimeType: 'video/webm' },
      formatVersion: 1,
      revision: 1,
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
}
async function issued() {
  const egressAuthority = await createReviewTextEgressAuthority(request);
  const token = issueLlmSessionToken({ purpose: 'review-text', sender, egressAuthority });
  if (!token) throw new Error('fixture token');
  return { ...request, llmSessionToken: token };
}
beforeEach(() => {
  vi.clearAllMocks();
  resetLlmSessionTokensForTests();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
  read.mockResolvedValue(fixture());
});
afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});

describe('Gallery text editing authorization', () => {
  it('admits only the owned top-level Gallery document and consumes its exact session once', async () => {
    expect(isReviewTextSender(sender)).toBe(true);
    expect(isReviewTextSender({ id: sender.id, frameId: 0, url: sender.url })).toBe(false);
    for (const patch of [
      { id: 'other' },
      { frameId: 1 },
      { url: 'https://extension/apps/extension/src/gallery/index.html' },
      { url: 'chrome-extension://extension/apps/extension/src/scenario-editor/index.html' },
    ])
      expect(isReviewTextSender({ ...sender, ...patch })).toBe(false);
    const start = await issued();
    await expect(
      authorizeReviewText(start, sender, new AbortController().signal)
    ).resolves.toBeUndefined();
    await expect(authorizeReviewText(start, sender, new AbortController().signal)).rejects.toThrow(
      'unauthorized'
    );
    expect(read).toHaveBeenCalledOnce();
  });
  it.each(['prompt', 'destination', 'scope', 'document'] as const)(
    'refuses changed %s binding and never reuses a rejected token',
    async (field) => {
      const start = await issued();
      const changed =
        field === 'prompt'
          ? { ...start, context: { ...start.context, prompt: 'Different' } }
          : field === 'destination'
            ? { ...start, approvedDestination: `sha256:${'b'.repeat(64)}` }
            : field === 'scope'
              ? { ...start, scope: { ...start.scope, workspaceRevision: 2 } }
              : start;
      await expect(
        authorizeReviewText(
          changed,
          field === 'document' ? { ...sender, documentId: 'other-document' } : sender,
          new AbortController().signal
        )
      ).rejects.toThrow('unauthorized');
      await expect(
        authorizeReviewText(start, sender, new AbortController().signal)
      ).rejects.toThrow('unauthorized');
      expect(read).not.toHaveBeenCalled();
    }
  );
  it('refuses missing, changed or differently projected committed scope before provider access', async () => {
    read.mockResolvedValueOnce(null);
    await expect(assertReviewTextJobScope(request, new AbortController().signal)).rejects.toThrow(
      'stale'
    );
    const saved = fixture();
    saved.workspace.revision = 2;
    read.mockResolvedValueOnce(saved);
    await expect(assertReviewTextJobScope(request, new AbortController().signal)).rejects.toThrow(
      'stale'
    );
    await expect(
      assertReviewTextJobScope(
        {
          ...request,
          context: {
            ...request.context,
            fragments: [{ ...request.context.fragments[0]!, text: 'Changed' }],
          },
        },
        new AbortController().signal
      )
    ).rejects.toThrow('stale');
    await expect(
      assertReviewTextJobScope(
        {
          ...request,
          context: {
            ...request.context,
            fragments: [{ ...request.context.fragments[0]!, start: 0 }],
          },
        },
        new AbortController().signal
      )
    ).rejects.toThrow('stale');
    await expect(
      assertReviewTextJobScope(
        { ...request, context: { ...request.context, window: { start: 1, end: 11 } } },
        new AbortController().signal
      )
    ).rejects.toThrow('stale');
  });
});
