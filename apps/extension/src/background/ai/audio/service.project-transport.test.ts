import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAudioJobService } from './service';
import type { AudioModelConfig } from './model-config';
import type { AudioJobServerMessage, AudioJobStart } from '../../../contracts/ai/audio';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { createVideoProjectAudioScope } from '../../../features/video/project/text/audio-scope';
import { encodeReviewSpeechWav } from '../../../workflows/video-review/speech-audio';

const storage = vi.hoisted(() => ({ project: vi.fn(), asset: vi.fn() }));
vi.mock('../../../composition/persistence/projects/index', () => ({
  getVideoProject: storage.project,
  getProjectAsset: storage.asset,
}));
beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const ticket = '12345678-1234-4234-8234-123456789abc';

function setup(mode: 'multipart' | 'audio-chat') {
  const project = createEmptyVideoProject('Speech');
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 640,
      height: 360,
      duration: 10,
      hasAudio: true,
      mimeType: 'video/webm',
      size: 5,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  project.assets = [asset];
  project.clips = [clip];
  const scope = createVideoProjectAudioScope(project, 3, clip.id, 0, 1);
  if (!scope) throw new Error('Missing scope');
  const saved = { status: 'ready', project, workspaceRevision: 3 };
  storage.project.mockResolvedValue(saved);
  storage.asset.mockResolvedValue({
    status: 'ready',
    entry: { file: new File(['video'], 'source.webm') },
  });
  const request: AudioJobStart = {
    type: 'start',
    operation: 'transcription',
    requestId: 'r',
    modelId: 'model',
    approvedProviderId: 'provider',
    scope,
    ...(mode === 'audio-chat'
      ? { recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' } }
      : {}),
  };
  const config: AudioModelConfig = {
    connectionType: 'openai-compatible',
    baseUrl: 'https://provider.test/audio',
    url: 'https://provider.test/audio',
    apiKey: 'fixture',
    modelCode: 'model',
    transcription: {
      responseFormat: 'json',
      timestampGranularity: 'none',
      ...(mode === 'audio-chat'
        ? { transport: 'audio-chat', chatProtocol: 'openai', structuredOutput: 'json_schema' }
        : {}),
    },
  };
  const wav = new File([encodeReviewSpeechWav(new Float32Array(16000).fill(0.5))], 'input.wav', {
    type: 'audio/wav',
  });
  const resolveModel = vi.fn(async () => config);
  const discard = vi.fn(async () => undefined);
  const service = createAudioJobService({
    resolveModel,
    read: async () => wav,
    discard,
    createId: () => ticket,
  });
  const messages: AudioJobServerMessage[] = [];
  const connection = service.connect((message) => messages.push(message), 'project');
  return { saved, request, config, wav, resolveModel, discard, messages, connection };
}

it.each([
  ['multipart', 'revision'],
  ['audio-chat', 'revision'],
  ['multipart', 'trash'],
  ['multipart', 'provider'],
] as const)(
  'refuses %s after a %s change during body materialization before POST',
  async (mode, change) => {
    const job = setup(mode);
    let release!: () => void;
    let start!: () => void;
    const entered = new Promise<void>((resolve) => {
      start = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const materialize = job.wav.arrayBuffer.bind(job.wav);
    vi.spyOn(job.wav, 'arrayBuffer').mockImplementationOnce(async () => {
      start();
      await gate;
      return materialize();
    });
    const post = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ text: 'Speech' }), {
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', post);
    try {
      job.connection.receive(job.request);
      await vi.waitFor(() =>
        expect(job.messages.some((message) => message.type === 'authorized')).toBe(true)
      );
      job.connection.receive({
        type: 'execute',
        requestId: 'r',
        ticket,
        staged: { id: ticket, mimeType: 'audio/wav', size: job.wav.size },
      });
      await entered;
      if (change === 'provider')
        job.resolveModel.mockResolvedValue({ ...job.config, modelCode: 'changed' });
      else if (change === 'trash')
        storage.project.mockResolvedValue({
          ...job.saved,
          lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 2 },
        });
      else storage.project.mockResolvedValue({ ...job.saved, workspaceRevision: 4 });
      release();
      await vi.waitFor(() =>
        expect(job.messages.some((message) => message.type === 'failure')).toBe(true)
      );
      expect(post).not.toHaveBeenCalled();
      expect(job.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'stale' });
    } finally {
      release();
      await job.connection.disconnect();
    }
  }
);

it.each(['multipart', 'audio-chat'] as const)(
  'posts an unchanged %s project source exactly once through the real transport',
  async (mode) => {
    const job = setup(mode);
    const response =
      mode === 'multipart'
        ? { text: 'Speech' }
        : {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({ segments: [{ text: 'Speech', start: 0, end: 1 }] }),
                },
              },
            ],
          };
    const post = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
    );
    vi.stubGlobal('fetch', post);
    try {
      job.connection.receive(job.request);
      await vi.waitFor(() =>
        expect(job.messages.some((message) => message.type === 'authorized')).toBe(true)
      );
      job.connection.receive({
        type: 'execute',
        requestId: 'r',
        ticket,
        staged: { id: ticket, mimeType: 'audio/wav', size: job.wav.size },
      });
      await vi.waitFor(() =>
        expect(job.messages.some((message) => message.type === 'transcript')).toBe(true)
      );
      expect(job.messages).toContainEqual(
        expect.objectContaining({
          type: 'transcript',
          result: expect.objectContaining({ text: 'Speech' }),
        })
      );
      expect(post).toHaveBeenCalledOnce();
      expect(job.resolveModel).toHaveBeenCalledTimes(3);
      expect(job.discard).toHaveBeenCalledOnce();
      job.connection.receive({
        type: 'execute',
        requestId: 'r',
        ticket,
        staged: { id: ticket, mimeType: 'audio/wav', size: job.wav.size },
      });
      expect(post).toHaveBeenCalledOnce();
    } finally {
      await job.connection.disconnect();
    }
  }
);
