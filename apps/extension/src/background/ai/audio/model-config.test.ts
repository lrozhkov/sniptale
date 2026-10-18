import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeAiStorageAccess,
  loadAudioTranscriptionSystemPrompt,
  loadAIModels,
  loadAIProviders,
} from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import type { AudioJobServerMessage, AudioJobStart } from '../../../contracts/ai/audio';
import { resolveAudioModelConfig } from './model-config';
import { createAudioJobService } from './service';

vi.mock('../../../composition/persistence/ai-settings', () => ({
  initializeAiStorageAccess: vi.fn(),
  loadAudioTranscriptionSystemPrompt: vi.fn(),
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
}));
vi.mock('../../../composition/persistence/ai-settings/provider-secrets.store', () => ({
  activateStoredAIProviderSecretForUse: vi.fn(),
}));

const permission = vi.fn(async (_request: chrome.permissions.Permissions) => true);
const provider: AIProvider = {
  id: 'provider',
  name: 'Test connection',
  connectionType: 'openai-compatible',
  baseUrl: 'https://audio.example.test/custom/v1/',
  hasStoredApiKey: true,
  createdAt: 1,
};
const model: AIModel = {
  id: 'model',
  providerId: provider.id,
  modelCode: 'speech-model',
  displayName: 'Speech',
  operation: 'speech',
  audio: { speech: { voiceId: 'configured', responseFormat: 'wav', speed: 1 } },
};
const request: AudioJobStart = {
  type: 'start',
  requestId: 'request',
  modelId: model.id,
  operation: 'speech',
  scope: {
    workspaceId: 'workspace',
    workspaceRevision: 1,
    target: { kind: 'voiceover' as const, clipId: 'clip' },
    assetId: 'asset',
    nativeStart: 0,
    nativeEnd: 1,
  },
  phraseId: 'phrase',
  textRevision: 1,
  text: 'Saved phrase',
  profile: {
    voiceId: 'selected',
    responseFormat: 'mp3',
    speed: 1.25,
    instructions: 'Speak clearly.',
  },
};

const authoredRequest: AudioJobStart = {
  ...request,
  approvedProviderId: provider.id,
  scope: {
    workspaceId: 'workspace',
    workspaceRevision: 1,
    target: { kind: 'text', fragmentId: 'phrase' },
    textRevision: 1,
    timingRevision: 0,
    start: 0,
    end: 1,
    timeDomain: 'result',
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', { permissions: { contains: permission } });
  permission.mockResolvedValue(true);
  vi.mocked(initializeAiStorageAccess).mockResolvedValue(undefined);
  vi.mocked(loadAudioTranscriptionSystemPrompt).mockResolvedValue('Audio instructions');
  vi.mocked(loadAIModels).mockResolvedValue([model]);
  vi.mocked(loadAIProviders).mockResolvedValue([provider]);
  vi.mocked(activateStoredAIProviderSecretForUse).mockResolvedValue('fixture-secret');
});
afterEach(() => vi.unstubAllGlobals());

describe('audio model operation and credential admission', () => {
  it('refuses a stale disclosed provider binding before secret access and POST', async () => {
    vi.mocked(loadAIModels).mockResolvedValue([{ ...model, providerId: 'changed-provider' }]);
    vi.mocked(loadAIProviders).mockResolvedValue([{ ...provider, id: 'changed-provider' }]);
    const post = vi.fn();
    const messages: AudioJobServerMessage[] = [];
    const service = createAudioJobService({
      authorize: vi.fn(async () => undefined),
      request: post,
    });
    const job = service.connect((message) => messages.push(message));
    job.receive(authoredRequest);
    await vi.waitFor(() =>
      expect(messages.some((message) => message.type === 'failure')).toBe(true)
    );
    expect(messages).toContainEqual({
      type: 'failure',
      requestId: request.requestId,
      code: 'model-unavailable',
    });
    expect(permission).not.toHaveBeenCalled();
    expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    await job.disconnect();
  });

  it('requires text consent identity even when called without port parsing', async () => {
    const unapproved = structuredClone(authoredRequest);
    delete unapproved.approvedProviderId;
    await expect(resolveAudioModelConfig(unapproved)).rejects.toThrow('model-unavailable');
    expect(permission).not.toHaveBeenCalled();
    expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
  });

  it('uses the matching disclosed provider for authored speech', async () => {
    await expect(resolveAudioModelConfig(authoredRequest)).resolves.toMatchObject({
      url: 'https://audio.example.test/custom/v1/audio/speech',
      modelCode: model.modelCode,
      speech: request.profile,
    });
    expect(activateStoredAIProviderSecretForUse).toHaveBeenCalledExactlyOnceWith(provider);
  });

  it('checks exact provider origin permission before resolving its bound secret', async () => {
    await expect(resolveAudioModelConfig(request)).resolves.toEqual({
      url: 'https://audio.example.test/custom/v1/audio/speech',
      apiKey: 'fixture-secret',
      modelCode: 'speech-model',
      speech: request.profile,
    });
    expect(permission).toHaveBeenCalledWith({ origins: ['https://audio.example.test/*'] });
    expect(permission).toHaveBeenCalledBefore(vi.mocked(activateStoredAIProviderSecretForUse));
    expect(activateStoredAIProviderSecretForUse).toHaveBeenCalledExactlyOnceWith(provider);
  });

  it('uses stored transcription parameters without borrowing text or speech settings', async () => {
    const transcription = {
      responseFormat: 'verbose_json' as const,
      timestampGranularity: 'word' as const,
      language: 'en',
      prompt: 'Names.',
    };
    vi.mocked(loadAIModels).mockResolvedValue([
      { ...model, operation: 'transcription', audio: { transcription } },
    ]);
    await expect(
      resolveAudioModelConfig({
        type: 'start',
        requestId: 'r',
        operation: 'transcription',
        scope: request.scope,
        modelId: model.id,
      })
    ).resolves.toEqual({
      url: 'https://audio.example.test/custom/v1/audio/transcriptions',
      apiKey: 'fixture-secret',
      modelCode: model.modelCode,
      transcription,
    });
  });

  it.each<AIModel>([
    { ...model, operation: undefined, audio: undefined },
    { ...model, operation: 'text', audio: undefined },
    {
      ...model,
      operation: 'transcription',
      audio: { transcription: { responseFormat: 'json', timestampGranularity: 'none' } },
    },
    { ...model, audio: { speech: { voiceId: 'voice', responseFormat: 'mp3', speed: 0 } } },
  ])(
    'rejects incompatible or malformed operation before permission and secret access',
    async (candidate) => {
      vi.mocked(loadAIModels).mockResolvedValue([candidate]);
      await expect(resolveAudioModelConfig(request)).rejects.toThrow('model-unavailable');
      expect(permission).not.toHaveBeenCalled();
      expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
    }
  );

  it.each(['model', 'provider', 'secret-metadata'] as const)(
    'rejects deleted %s before key resolution',
    async (missing) => {
      if (missing === 'model') vi.mocked(loadAIModels).mockResolvedValue([]);
      if (missing === 'provider') vi.mocked(loadAIProviders).mockResolvedValue([]);
      if (missing === 'secret-metadata')
        vi.mocked(loadAIProviders).mockResolvedValue([{ ...provider, hasStoredApiKey: false }]);
      await expect(resolveAudioModelConfig(request)).rejects.toThrow('model-unavailable');
      expect(permission).not.toHaveBeenCalled();
      expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
    }
  );

  it.each([
    'http://audio.example.test/v1',
    'https://user:password@audio.example.test/v1',
    'https://audio.example.test/v1?query=1',
  ])('rejects forbidden provider URL before secret access: %s', async (baseUrl) => {
    vi.mocked(loadAIProviders).mockResolvedValue([{ ...provider, baseUrl }]);
    await expect(resolveAudioModelConfig(request)).rejects.toThrow('model-unavailable');
    expect(permission).not.toHaveBeenCalled();
    expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
  });

  it('rejects absent or revoked host access before key resolution', async () => {
    permission.mockResolvedValue(false);
    await expect(resolveAudioModelConfig(request)).rejects.toThrow('permission-denied');
    expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
  });

  it('fails closed when the permission API fails or the secret is locked', async () => {
    permission.mockRejectedValueOnce(new Error('Permission state unavailable'));
    await expect(resolveAudioModelConfig(request)).rejects.toThrow('Permission state unavailable');
    expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
    vi.mocked(activateStoredAIProviderSecretForUse).mockResolvedValue(null);
    await expect(resolveAudioModelConfig(request)).rejects.toThrow('secret-unavailable');
  });
});

it('authorizes before credentials and rechecks model deletion before POST', async () => {
  const post = vi.fn();
  const rejected: AudioJobServerMessage[] = [];
  const denied = createAudioJobService({
    authorize: vi.fn(async () => {
      throw new Error('unauthorized');
    }),
    request: post,
  });
  const connection = denied.connect((message) => rejected.push(message));
  connection.receive(request);
  await vi.waitFor(() => expect(rejected.some((message) => message.type === 'failure')).toBe(true));
  expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
  expect(loadAIModels).not.toHaveBeenCalled();
  await connection.disconnect();

  vi.mocked(loadAIModels).mockResolvedValueOnce([model]).mockResolvedValue([]);
  const messages: AudioJobServerMessage[] = [];
  const authorize = vi.fn(async () => undefined);
  const service = createAudioJobService({ authorize, request: post });
  const job = service.connect((message) => messages.push(message));
  job.receive(request);
  await vi.waitFor(() =>
    expect(messages).toContainEqual({
      type: 'failure',
      requestId: request.requestId,
      code: 'model-unavailable',
    })
  );
  expect(authorize).toHaveBeenCalledBefore(vi.mocked(activateStoredAIProviderSecretForUse));
  expect(activateStoredAIProviderSecretForUse).toHaveBeenCalledTimes(1);
  expect(post).not.toHaveBeenCalled();
  await job.disconnect();
});

it('resolves a declared chat endpoint and rejects mismatched request transport before credentials', async () => {
  const transcriber: AIModel = {
    ...model,
    operation: 'transcription',
    audio: {
      transcription: {
        transport: 'audio-chat',
        chatProtocol: 'bothub',
        structuredOutput: 'json_schema',
        responseFormat: 'json',
        timestampGranularity: 'none',
      },
    },
  };
  vi.mocked(loadAIModels).mockResolvedValue([transcriber]);
  const start: AudioJobStart = {
    type: 'start',
    requestId: 'chat',
    operation: 'transcription',
    modelId: model.id,
    approvedProviderId: provider.id,
    scope: request.scope,
    recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' },
  };
  await expect(resolveAudioModelConfig(start)).resolves.toMatchObject({
    url: 'https://audio.example.test/custom/v1/chat/completions',
    transcriptionInstructions: 'Audio instructions',
  });
  vi.mocked(activateStoredAIProviderSecretForUse).mockClear();
  const { approvedProviderId: _approved, ...unapproved } = start;
  await expect(resolveAudioModelConfig(unapproved)).rejects.toThrow('model-unavailable');
  expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
  const { recognition: _recognition, ...missing } = start;
  await expect(resolveAudioModelConfig(missing)).rejects.toThrow('invalid-request');
  expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
});

it('requires matching Scenario provider approval before permission and secret activation', async () => {
  const scenario = {
    type: 'start' as const,
    requestId: 'scenario',
    operation: 'speech' as const,
    modelId: model.id,
    approvedProviderId: provider.id,
    text: 'Saved action',
    profile: request.profile,
    scope: {
      workspaceId: 'scenario',
      workspaceRevision: 1,
      target: { kind: 'scenario-text' as const, slideId: 'slide', objectId: 'action' },
      sourceTextHash: 'a'.repeat(64),
    },
  };
  // A direct caller can omit approval despite the compile-time contract.
  const unapproved = { ...scenario };
  Reflect.deleteProperty(unapproved, 'approvedProviderId');
  for (const candidate of [
    unapproved,
    { ...scenario, approvedProviderId: '' },
    { ...scenario, approvedProviderId: 'foreign' },
  ]) {
    await expect(resolveAudioModelConfig(candidate)).rejects.toThrow('model-unavailable');
    expect(permission).not.toHaveBeenCalled();
    expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
  }
  await expect(resolveAudioModelConfig(scenario)).resolves.toMatchObject({
    speech: request.profile,
  });
  expect(activateStoredAIProviderSecretForUse).toHaveBeenCalledExactlyOnceWith(provider);
});
