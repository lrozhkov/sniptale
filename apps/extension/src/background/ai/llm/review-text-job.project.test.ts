import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewTextJobService } from './review-text-job';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from './session-tokens';
import { createReviewTextEgressAuthority } from '../../../features/ai/egress-authority';
import { captureVideoProjectTextRewriteContext } from '../../../features/video/project/text/rewrite-context';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { ReviewTextStart, ReviewTextServerMessage } from '../../../contracts/ai/review-text';
import type { VideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
const storage = vi.hoisted(() => ({ read: vi.fn(), bytes: vi.fn(), current: vi.fn() }));
vi.mock('../../../composition/persistence/projects/revision', () => ({
  isCurrentVideoProjectSnapshot: storage.current,
}));
vi.mock('../../../composition/persistence/projects', () => ({
  getVideoProject: storage.read,
  getProjectAsset: storage.bytes,
}));
const sender = {
  id: 'extension',
  frameId: 0,
  documentId: 'document',
  url: 'chrome-extension://extension/apps/extension/src/video-editor/index.html',
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  storage.current.mockResolvedValue(true);
  resetLlmSessionTokensForTests();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
});
afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.unstubAllGlobals();
});
it.each(['deleted', 'revision', 'text', 'placement', 'trash', 'current'] as const)(
  'refuses a deleted or changed project during final model admission (%s)',
  async (change) => {
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
    let saved: VideoProjectReadResult = { status: 'ready', workspaceRevision: 1, project };
    storage.read.mockImplementation(async () => saved);
    const start: ReviewTextStart = {
      type: 'start',
      requestId: 'be0e898c-dcdf-4a0c-8e99-83949774b5ab',
      modelId: 'model',
      approvedProviderId: 'provider',
      approvedDestination: `sha256:${'a'.repeat(64)}`,
      approvedModelCode: 'code',
      llmSessionToken: 'unissued',
      scope: {
        kind: 'project-text',
        projectId: 'project',
        projectRevision: 1,
        projectUpdatedAt: 10,
        documentId: 'document',
      },
      context: captureVideoProjectTextRewriteContext(project, 'document', ['text'], {
        prompt: 'Shorten',
        mode: 'phrases',
        wholeDocument: true,
        changeIntervals: false,
        resegment: false,
      }),
    };
    const token = issueLlmSessionToken({
      purpose: 'review-text',
      sender,
      egressAuthority: await createReviewTextEgressAuthority(start),
    });
    if (!token) throw new Error('fixture token');
    start.llmSessionToken = token;
    const entered = deferred();
    const release = deferred();
    const config = {
      modelId: 'model',
      providerId: 'provider',
      baseUrl: 'https://provider.test/v1',
      apiKey: 'key',
      modelCode: 'code',
      effectiveSystemPrompt: '',
    };
    let modelReads = 0;
    const post = vi.fn(async () =>
      JSON.stringify({ version: 1, fragments: [{ fromIds: ['text'], text: 'Short words' }] })
    );
    const history = vi.fn(async () => undefined);
    const service = createReviewTextJobService({
      resolveModel: async () => {
        if (++modelReads === 2) {
          entered.resolve();
          await release.promise;
        }
        return config;
      },
      request: post,
      history,
    });
    const messages: ReviewTextServerMessage[] = [];
    service.connect(sender, (message) => messages.push(message)).receive(start);
    await entered.promise;
    if (change === 'deleted') saved = { status: 'notFound' };
    if (change === 'revision') saved = { status: 'ready', project, workspaceRevision: 2 };
    if (change === 'text') project.textDocuments[0]!.document.fragments[0]!.text = 'Changed';
    if (change === 'placement') project.textDocuments[0]!.document.fragments[0]!.start = 2;
    if (change === 'trash')
      saved = {
        status: 'ready',
        project,
        workspaceRevision: 1,
        lifecycle: { storageClass: 'library', updatedAt: 1, savedAt: 1, trashedAt: 1 },
      };
    release.resolve();
    const reservation = service.reserveErasureExclusion();
    await reservation.waitForActiveMutations();
    reservation.release();
    expect(post).toHaveBeenCalledTimes(change === 'current' ? 1 : 0);
    expect(messages.at(-1)?.type).toBe(change === 'current' ? 'proposal' : 'failure');
    if (change !== 'current') {
      expect(messages.at(-1)).toMatchObject({ code: 'stale' });
      expect(history).not.toHaveBeenCalled();
    }
    expect(storage.bytes).not.toHaveBeenCalled();
  }
);
