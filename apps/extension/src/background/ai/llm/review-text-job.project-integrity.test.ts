import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewTextJobService } from './review-text-job';
import { issueLlmSessionToken, resetLlmSessionTokensForTests } from './session-tokens';
import { createReviewTextEgressAuthority } from '../../../features/ai/egress-authority';
import { captureVideoProjectTextRewriteContext } from '../../../features/video/project/text/rewrite-context';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { readFileSync } from 'node:fs';
import { importAnimationArtifactBytes } from '../../../features/video/project/effect-bundle/lottie-profile';
import * as runtimeAnimation from '../../../contracts/effect-runtime/animation';
import type { ReviewTextStart, ReviewTextServerMessage } from '../../../contracts/ai/review-text';
import type { VideoProjectEntry } from '../../../composition/persistence/projects/contracts';

const database = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => ({ get: database.get }),
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
async function fixture(): Promise<VideoProjectEntry> {
  const imported = await importAnimationArtifactBytes(
    readFileSync('apps/extension/public/video-effects/animations/title.sniptale-animation.json')
  );
  if (!imported.ok) throw new Error('Invalid inline resource fixture');
  const document = imported.documents[0]!;
  const project = createEmptyVideoProject('Text');
  project.version = 52;
  project.id = 'project';
  project.updatedAt = 10;
  project.duration = 10;
  project.effectSnapshots = [
    {
      assets: [],
      documentId: document.template.id,
      id: `effect:${document.sha256}`,
      kind: 'standalone',
      retainedByteLength: Buffer.byteLength(document.source),
      schemaVersion: 'sniptale.animation.v1',
      sha256: document.sha256,
      source: document.source,
    },
  ];
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
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  project.assets = [asset];
  project.clips = [clip];
  project.textDocuments = [
    {
      id: 'document',
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
      document: {
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
      },
    },
  ];
  return {
    id: project.id,
    project,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    workspaceRevision: 1,
    lifecycle: { storageClass: 'library', savedAt: 10, updatedAt: 10 },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  resetLlmSessionTokensForTests();
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', getURL: (path: string) => `chrome-extension://extension/${path}` },
  });
});
afterEach(() => {
  resetLlmSessionTokensForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  'deleted',
  'trash',
  'revision',
  'text',
  'placement',
  'recreated',
  'current',
  'cancelled',
] as const)(
  'rechecks the canonical snapshot after actual effect-byte integrity admission (%s)',
  async (change) => {
    const original = await fixture();
    let current: VideoProjectEntry | undefined = original;
    database.get.mockImplementation(async (store: string, id: string) => {
      expect(store).toBe('video_projects');
      expect(id).toBe(original.id);
      return current;
    });
    const { getVideoProject } = await import('../../../composition/persistence/projects');
    const { parseVideoProjectEntryResult } =
      await import('../../../composition/persistence/projects/read-guards');
    expect(parseVideoProjectEntryResult(original)).toMatchObject({ status: 'ready' });
    expect(await getVideoProject(original.id)).toMatchObject({ status: 'ready' });
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
        projectId: original.id,
        projectRevision: 1,
        projectUpdatedAt: 10,
        documentId: 'document',
      },
      context: captureVideoProjectTextRewriteContext(original.project, 'document', ['text'], {
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
    if (!token) throw new Error('Fixture token');
    start.llmSessionToken = token;
    const entered = deferred();
    const release = deferred();
    const actualVerify = runtimeAnimation.verifyRuntimeAnimationSource;
    let integrityReads = 0;
    vi.spyOn(runtimeAnimation, 'verifyRuntimeAnimationSource').mockImplementation(
      async (...args) => {
        const valid = await actualVerify(...args);
        if (++integrityReads === 3) {
          entered.resolve();
          await release.promise;
        }
        return valid;
      }
    );
    const config = {
      modelId: 'model',
      providerId: 'provider',
      baseUrl: 'https://provider.test/v1',
      apiKey: 'key',
      modelCode: 'code',
      connectionType: 'openai-compatible' as const,
      destinationBinding: 'fixture-destination-binding',
      effectiveSystemPrompt: '',
    };
    const post = vi.fn(async () =>
      JSON.stringify({ version: 1, fragments: [{ fromIds: ['text'], text: 'Short words' }] })
    );
    const history = vi.fn(async () => undefined);
    const service = createReviewTextJobService({
      resolveModel: async () => config,
      request: post,
      history,
    });
    const messages: ReviewTextServerMessage[] = [];
    const terminal = deferred();
    const connection = service.connect(sender, (message) => {
      messages.push(message);
      if (message.type === 'failure' || message.type === 'proposal') terminal.resolve();
    });
    connection.receive(start);
    await Promise.race([
      entered.promise,
      terminal.promise.then(() => {
        throw new Error(JSON.stringify(messages));
      }),
    ]);
    expect(integrityReads).toBe(3);
    expect(post).not.toHaveBeenCalled();
    const changed = structuredClone(original);
    if (change === 'deleted') current = undefined;
    if (change === 'trash')
      current = { ...changed, lifecycle: { ...changed.lifecycle!, trashedAt: 11 } };
    if (change === 'revision') current = { ...changed, workspaceRevision: 2 };
    if (change === 'text' || change === 'recreated') {
      changed.project.textDocuments![0]!.document.fragments[0]!.text = 'Different restored words';
      // Restore can preserve the archived revision and timestamp while replacing the content.
      current = changed;
    }
    if (change === 'placement') {
      changed.project.clips[0]!.startTime = 2;
      current = changed;
    }
    if (change === 'cancelled') connection.receive({ type: 'cancel', requestId: start.requestId });
    release.resolve();
    const reservation = service.reserveErasureExclusion();
    await reservation.waitForActiveMutations();
    reservation.release();
    expect(post).toHaveBeenCalledTimes(change === 'current' ? 1 : 0);
    if (change === 'current') {
      expect(messages.at(-1)?.type).toBe('proposal');
    } else {
      expect(messages.at(-1)).toMatchObject({
        type: 'failure',
        code: change === 'cancelled' ? 'cancelled' : 'stale',
      });
      expect(history).not.toHaveBeenCalled();
    }
  }
);
