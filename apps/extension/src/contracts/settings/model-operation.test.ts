import { describe, expect, it } from 'vitest';
import {
  filterAIModelsByOperation,
  supportsAIModelOperation,
  supportsAIProviderModelOperation,
  getAIModelOperation,
  isValidAIModelOperationConfiguration,
} from './model-operation';

describe('AI model operation configuration', () => {
  it('keeps legacy models text and separates audio catalogs', () => {
    const legacy = { id: 'legacy', operation: undefined };
    const speech = { id: 'speech', operation: 'speech' as const };
    expect(getAIModelOperation(legacy)).toBe('text');
    expect(filterAIModelsByOperation([legacy, speech], 'text')).toEqual([legacy]);
    expect(filterAIModelsByOperation([legacy, speech], 'speech')).toEqual([speech]);
  });

  it.each([
    {
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
    },
    {},
    { operation: 'text' },
    {
      operation: 'transcription',
      audio: {
        transcription: {
          responseFormat: 'verbose_json',
          timestampGranularity: 'word',
          language: 'ru',
        },
      },
    },
    {
      operation: 'transcription',
      audio: { transcription: { responseFormat: 'json', timestampGranularity: 'none' } },
    },
    {
      operation: 'speech',
      audio: {
        speech: { voiceId: 'custom', responseFormat: 'wav', speed: 1.2, instructions: 'Quietly' },
      },
    },
  ])('accepts typed declared configuration %j', (value) => {
    expect(isValidAIModelOperationConfiguration(value)).toBe(true);
  });

  it.each([
    { operation: 'other' },
    {
      operation: 'transcription',
      audio: {
        transcription: {
          transport: 'audio-chat',
          chatProtocol: 'unknown',
          structuredOutput: 'json_schema',
          responseFormat: 'json',
          timestampGranularity: 'none',
        },
      },
    },
    {
      operation: 'transcription',
      audio: {
        transcription: {
          transport: 'audio-api',
          chatProtocol: 'bothub',
          responseFormat: 'json',
          timestampGranularity: 'none',
        },
      },
    },
    { operation: 'speech' },
    { audio: {} },
    { operation: 'text', audio: { speech: { voiceId: 'x', responseFormat: 'mp3' } } },
    { operation: 'transcription', audio: { speech: { voiceId: 'x', responseFormat: 'mp3' } } },
    {
      operation: 'transcription',
      audio: { transcription: { responseFormat: 'json', timestampGranularity: 'word' } },
    },
    {
      operation: 'transcription',
      audio: {
        transcription: {
          responseFormat: 'json',
          timestampGranularity: 'none',
          language: 'automatic',
        },
      },
    },
    { operation: 'speech', audio: { speech: { voiceId: '', responseFormat: 'mp3' } } },
    ...[NaN, Infinity, 0, 4.1].map((speed) => ({
      operation: 'speech',
      audio: { speech: { voiceId: 'x', responseFormat: 'mp3', speed } },
    })),
    {
      operation: 'speech',
      audio: { speech: { voiceId: 'x', responseFormat: 'mp3', authorization: 'untrusted' } },
    },
    {
      operation: 'speech',
      audio: { speech: { voiceId: 'x', responseFormat: 'mp3' }, transcription: {} },
    },
  ])('rejects incompatible or undeclared configuration %j', (value) => {
    expect(isValidAIModelOperationConfiguration(value)).toBe(false);
  });
});

it('admits explicitly selected PCM synthesis without model-name inference', () => {
  expect(
    isValidAIModelOperationConfiguration({
      operation: 'speech',
      audio: { speech: { voiceId: 'Leda', responseFormat: 'pcm' } },
    })
  ).toBe(true);
});

it('requires manual property ownership for a retired model override', () => {
  const model = {
    source: 'manual' as const,
    retirementOverride: true,
    capabilities: {
      operations: { text: 'supported' as const },
      input: {},
      output: {},
      features: {},
    },
    catalog: {
      displayName: 'Retired',
      lifecycle: 'retired' as const,
      observedAt: 1,
      capabilities: {
        operations: { text: 'supported' as const },
        input: {},
        output: {},
        features: {},
      },
    },
  };
  expect(supportsAIModelOperation({ ...model, propertySource: 'catalog' }, 'text')).toBe(false);
  expect(supportsAIModelOperation({ ...model, propertySource: 'manual' }, 'text')).toBe(true);
  expect(
    supportsAIModelOperation({ ...model, propertySource: 'manual', enabled: false }, 'text')
  ).toBe(false);
});

it('admits catalog-owned properties on a manual allowlist without enabling automatic rows', () => {
  const model = {
    source: 'manual' as const,
    propertySource: 'catalog' as const,
    capabilities: {
      operations: { text: 'supported' as const },
      input: {},
      output: {},
      features: {},
    },
  };
  const provider = { connectionType: 'neuraldeep' as const, management: 'manual' as const };
  expect(supportsAIProviderModelOperation(model, provider, 'text')).toBe(true);
  expect(supportsAIProviderModelOperation({ ...model, source: 'catalog' }, provider, 'text')).toBe(
    false
  );
});

it('accepts independent speech and recognition parameters for a model with several declared operations', () => {
  const capabilities = {
    operations: { text: 'supported', speech: 'supported', transcription: 'supported' },
    input: {},
    output: {},
    features: {},
  };
  expect(isValidAIModelOperationConfiguration({ capabilities })).toBe(true);
  expect(
    isValidAIModelOperationConfiguration({
      capabilities,
      operation: 'text',
      audio: {
        speech: { voiceId: 'voice', responseFormat: 'mp3' },
        transcription: { responseFormat: 'json', timestampGranularity: 'none' },
      },
    })
  ).toBe(true);
  expect(
    isValidAIModelOperationConfiguration({
      capabilities: { ...capabilities, operations: { text: 'supported' } },
      audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' } },
    })
  ).toBe(false);
});
