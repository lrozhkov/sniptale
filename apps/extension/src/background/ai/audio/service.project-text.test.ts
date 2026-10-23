import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAudioJobService } from './service';
import type { AudioModelConfig } from './model-config';
import type { AudioJobServerMessage, AudioJobStart } from '../../../contracts/ai/audio';
import { createVideoProjectEntry } from '../../../composition/persistence/projects/index.test-support';
import type { VideoProjectEntry } from '../../../composition/persistence/projects/contracts';
import { createVideoProjectTextAudioScope } from '../../../features/video/project/text/voice-scope';

const database = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => ({ get: database.get }),
}));

let current: VideoProjectEntry | undefined;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup() {
  current = createVideoProjectEntry(
    {
      version: 5,
      textDocuments: [
        {
          id: 'document',
          binding: { kind: 'project' },
          document: {
            version: 1,
            fragments: [
              {
                id: 'phrase',
                text: 'Only these saved words reach the speech provider.',
                originalText: '',
                revision: 2,
                timingRevision: 0,
                start: 1,
                end: 3,
                timeDomain: 'result',
                alignment: 'manual',
                showInVideo: true,
              },
            ],
          },
        },
      ],
    },
    { workspaceRevision: 3 }
  );
  database.get.mockImplementation(async () => structuredClone(current));
  const { scope } = await createVideoProjectTextAudioScope(
    current.project,
    3,
    'document',
    'phrase'
  );
  const request: AudioJobStart = {
    type: 'start',
    operation: 'speech',
    requestId: 'request',
    modelId: 'model',
    approvedProviderId: 'provider',
    scope,
    phraseId: 'phrase',
    textRevision: 2,
    text: current.project.textDocuments![0]!.document.fragments[0]!.text,
    profile: { voiceId: 'voice', responseFormat: 'wav' },
  };
  const config: AudioModelConfig = {
    url: 'https://provider.test/audio/speech',
    apiKey: 'fixture-key',
    modelCode: 'speech-model',
    speech: { voiceId: 'voice', responseFormat: 'wav' },
  };
  const resolveModel = vi.fn(async () => config);
  const handle = {
    id: '12345678-1234-4234-8234-123456789abc',
    size: 4,
    mimeType: 'audio/wav' as const,
  };
  const write = vi.fn(async () => handle);
  const discard = vi.fn(async () => undefined);
  const read = vi.fn();
  const service = createAudioJobService({ resolveModel, write, discard, read });
  const messages: AudioJobServerMessage[] = [];
  const connection = service.connect((message) => messages.push(message), 'project');
  const fetch = vi.fn(
    async () => new Response('wave', { headers: { 'Content-Type': 'audio/wav' } })
  );
  vi.stubGlobal('fetch', fetch);
  return { request, config, resolveModel, write, read, discard, messages, connection, fetch };
}

async function waitForResult(messages: AudioJobServerMessage[]) {
  await vi.waitFor(() => {
    expect(messages.some((message) => message.type === 'audio' || message.type === 'failure')).toBe(
      true
    );
  });
}

it('sends one text-only paid request and publishes through the existing disposable-audio port', async () => {
  const job = await setup();
  job.connection.receive(job.request);
  await waitForResult(job.messages);
  expect(job.messages.some((message) => message.type === 'audio')).toBe(true);
  expect(job.messages.some((message) => message.type === 'authorized')).toBe(false);
  expect(job.read).not.toHaveBeenCalled();
  expect(job.fetch).toHaveBeenCalledTimes(1);
  expect(job.write).toHaveBeenCalledWith(expect.objectContaining({ scope: job.request.scope }));
  await job.connection.disconnect();
});

it.each(['revision', 'missing', 'trash', 'restored-text', 'provider', 'cancel'])(
  'refuses %s during the final model await before POST',
  async (change) => {
    const job = await setup();
    const entered = deferred();
    const gate = deferred();
    let calls = 0;
    job.resolveModel.mockImplementation(async () => {
      if (++calls === 3) {
        entered.resolve();
        await gate.promise;
      }
      return change === 'provider' && calls === 3
        ? { ...job.config, url: 'https://changed.test/speech' }
        : job.config;
    });
    job.connection.receive(job.request);
    await entered.promise;
    if (!current) throw new Error('Missing canonical fixture');
    switch (change) {
      case 'revision':
        current.workspaceRevision = 4;
        break;
      case 'missing':
        current = undefined;
        break;
      case 'trash':
        current.lifecycle = {
          storageClass: 'library',
          savedAt: 100,
          updatedAt: 100,
          trashedAt: 100,
        };
        break;
      case 'restored-text':
        current.project.textDocuments![0]!.document.fragments[0]!.text = 'Same-tuple restore';
        break;
      case 'provider':
        break;
      case 'cancel':
        job.connection.receive({ type: 'cancel', requestId: job.request.requestId });
        break;
    }
    gate.resolve();
    await waitForResult(job.messages);
    expect(job.messages).toContainEqual({
      type: 'failure',
      requestId: job.request.requestId,
      code: change === 'cancel' ? 'cancelled' : 'stale',
    });
    expect(job.fetch).not.toHaveBeenCalled();
    expect(job.write).not.toHaveBeenCalled();
    await job.connection.disconnect();
  }
);

it('does not publish a generated response after its canonical text changes', async () => {
  const job = await setup();
  const entered = deferred();
  const gate = deferred();
  job.fetch.mockImplementation(async () => {
    entered.resolve();
    await gate.promise;
    return new Response('wave', { headers: { 'Content-Type': 'audio/wav' } });
  });
  job.connection.receive(job.request);
  await entered.promise;
  if (!current) throw new Error('Missing canonical fixture');
  current.project.textDocuments![0]!.document.fragments[0]!.text = 'Changed during the response';
  gate.resolve();
  await waitForResult(job.messages);
  expect(job.messages).toContainEqual({ type: 'failure', requestId: 'request', code: 'stale' });
  expect(job.fetch).toHaveBeenCalledTimes(1);
  expect(job.write).not.toHaveBeenCalled();
  await job.connection.disconnect();
});
