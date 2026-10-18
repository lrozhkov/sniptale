import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authorizeReviewText, assertReviewTextJobScope } from './review-text';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from '../session-tokens';
import { createReviewTextEgressAuthority } from '../../../../features/ai/egress-authority';
import type { ReviewTextStart } from '../../../../contracts/ai/review-text';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../../features/video/project/types';
import {
  createVideoProjectAsset,
  createEmptyVideoProject,
} from '../../../../features/video/project/factories/creation';
import { captureVideoProjectTextRewriteContext } from '../../../../features/video/project/text/rewrite-context';

const storage = vi.hoisted(() => ({
  read: vi.fn(),
  bytes: vi.fn(),
  current: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock('../../../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: storage.current,
}));
vi.mock('../../../../composition/persistence/projects', () => ({
  getVideoProject: storage.read,
  getProjectAsset: storage.bytes,
}));
vi.mock('../../../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: storage.workspace,
}));
const sender = {
  id: 'extension',
  frameId: 0,
  documentId: 'editor-document',
  url: 'chrome-extension://extension/apps/extension/src/video-editor/index.html',
};
function fixture() {
  const project = createEmptyVideoProject('Text');
  project.version = 5;
  project.id = 'project';
  project.updatedAt = 10;
  project.duration = 10;
  project.textDocuments = [
    {
      id: 'document',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'text',
            text: 'Current words',
            originalText: '',
            revision: 0,
            timingRevision: 0,
            timeDomain: 'result',
            start: 1,
            end: 3,
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  return { status: 'ready' as const, workspaceRevision: 1, project };
}
function request(): ReviewTextStart {
  const saved = fixture();
  return {
    type: 'start',
    requestId: 'be0e898c-dcdf-4a0c-8e99-83949774b5ab',
    modelId: 'model',
    approvedProviderId: 'provider',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
    approvedModelCode: 'code',
    llmSessionToken: 'unissued',
    scope: {
      kind: 'project-text',
      projectId: saved.project.id,
      projectRevision: 1,
      projectUpdatedAt: 10,
      documentId: 'document',
    },
    context: captureVideoProjectTextRewriteContext(saved.project, 'document', ['text'], {
      prompt: 'Shorten',
      mode: 'phrases',
      wholeDocument: true,
      changeIntervals: false,
      resegment: false,
    }),
  };
}
async function issued(start = request(), identity = sender) {
  const token = issueLlmSessionToken({
    purpose: 'review-text',
    sender: identity,
    egressAuthority: await createReviewTextEgressAuthority(start),
  });
  if (!token) throw new Error('fixture token');
  return { ...start, llmSessionToken: token };
}
beforeEach(() => {
  vi.clearAllMocks();
  resetLlmSessionTokensForTests();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
  storage.read.mockResolvedValue(fixture());
  storage.current.mockResolvedValue(true);
});
afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});
it('binds montage scope and exact disclosure to one owned editor document', async () => {
  const start = await issued();
  await expect(
    authorizeReviewText(start, sender, new AbortController().signal)
  ).resolves.toBeUndefined();
  await expect(authorizeReviewText(start, sender, new AbortController().signal)).rejects.toThrow(
    'unauthorized'
  );
  for (const change of [
    (value: ReviewTextStart) => ({ ...value, context: { ...value.context, prompt: 'Different' } }),
    (value: ReviewTextStart) => ({ ...value, approvedModelCode: 'different' }),
    (value: ReviewTextStart) => ({ ...value, approvedProviderId: 'different' }),
    (value: ReviewTextStart) => ({ ...value, approvedDestination: `sha256:${'b'.repeat(64)}` }),
  ]) {
    const token = await issued();
    await expect(
      authorizeReviewText(change(token), sender, new AbortController().signal)
    ).rejects.toThrow('unauthorized');
    await expect(authorizeReviewText(token, sender, new AbortController().signal)).rejects.toThrow(
      'unauthorized'
    );
  }
  const gallery = { ...sender, url: sender.url.replace('video-editor', 'gallery') };
  await expect(
    authorizeReviewText(await issued(request(), gallery), gallery, new AbortController().signal)
  ).rejects.toThrow('unauthorized');
  const workspace = { ...request(), scope: { workspaceId: 'workspace', workspaceRevision: 1 } };
  await expect(
    authorizeReviewText(await issued(workspace), sender, new AbortController().signal)
  ).rejects.toThrow('unauthorized');
  const moved = await issued();
  await expect(
    authorizeReviewText(moved, { ...sender, documentId: 'other' }, new AbortController().signal)
  ).rejects.toThrow('unauthorized');
  expect(storage.workspace).not.toHaveBeenCalled();
  expect(storage.bytes).not.toHaveBeenCalled();
});
it('refuses missing trashed revised or recreated project scope', async () => {
  for (const saved of [
    { status: 'notFound' },
    { status: 'invalid' },
    { ...fixture(), lifecycle: { trashedAt: 1 } },
    { ...fixture(), workspaceRevision: 2 },
    { ...fixture(), project: { ...fixture().project, updatedAt: 11 } },
    { ...fixture(), project: { ...fixture().project, id: 'other' } },
  ]) {
    storage.read.mockResolvedValueOnce(saved);
    await expect(assertReviewTextJobScope(request(), new AbortController().signal)).rejects.toThrow(
      'stale'
    );
  }
});
it('refuses changed canonical text and placement without source reads', async () => {
  for (const field of ['text', 'start'] as const) {
    const saved = fixture();
    const fragment = saved.project.textDocuments![0]!.document.fragments[0]!;
    if (field === 'text') fragment.text = 'Changed';
    else fragment.start = 2;
    storage.read.mockResolvedValueOnce(saved);
    await expect(assertReviewTextJobScope(request(), new AbortController().signal)).rejects.toThrow(
      'stale'
    );
  }
  const saved = fixture();
  saved.project.textDocuments![0]!.id = 'other';
  storage.read.mockResolvedValueOnce(saved);
  await expect(assertReviewTextJobScope(request(), new AbortController().signal)).rejects.toThrow(
    'stale'
  );
  const forged = request();
  forged.context.fragments[0]!.ranges = [
    { start: 1, end: 2 },
    { start: 2, end: 3 },
  ];
  await expect(assertReviewTextJobScope(forged, new AbortController().signal)).rejects.toThrow(
    'stale'
  );
  expect(storage.bytes).not.toHaveBeenCalled();
});

it('admits exact repeated source placements and refuses altered ranges or binding', async () => {
  const saved = fixture();
  const asset = createVideoProjectAsset(
    'Source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'private-source' },
    {
      width: 640,
      height: 360,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(saved.project.tracks[0]!.id, asset, 640, 360, 0);
  if (clip.type !== 'VIDEO') throw new Error('Missing video fixture');
  saved.project.assets = [asset];
  saved.project.clips = [clip, { ...clip, id: 'second', sourceInstanceId: clip.id, startTime: 4 }];
  const entry = saved.project.textDocuments![0]!;
  entry.binding = { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id };
  entry.document.fragments[0]!.timeDomain = 'source';
  const start = request();
  start.context = captureVideoProjectTextRewriteContext(saved.project, entry.id, ['text'], {
    ...start.context,
    window: { start: 1, end: 7 },
  });
  expect(start.context.fragments[0]!.ranges).toEqual([
    { start: 1, end: 3 },
    { start: 5, end: 7 },
  ]);
  storage.read.mockResolvedValue(saved);
  await expect(
    authorizeReviewText(await issued(start), sender, new AbortController().signal)
  ).resolves.toBeUndefined();
  const forged = structuredClone(start);
  forged.context.fragments[0]!.ranges![0]!.end = 2;
  await expect(assertReviewTextJobScope(forged, new AbortController().signal)).rejects.toThrow(
    'stale'
  );
  entry.binding = { kind: 'source', assetId: 'other', sourceInstanceId: clip.id };
  await expect(assertReviewTextJobScope(start, new AbortController().signal)).rejects.toThrow(
    'stale'
  );
  expect(storage.bytes).not.toHaveBeenCalled();
});

it('refuses a snapshot replaced after full read admission', async () => {
  storage.current.mockResolvedValueOnce(false);
  await expect(
    authorizeReviewText(await issued(), sender, new AbortController().signal)
  ).rejects.toThrow('stale');
  expect(storage.current).toHaveBeenCalledOnce();
});
