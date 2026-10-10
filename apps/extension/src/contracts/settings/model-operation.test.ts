import { describe, expect, it } from 'vitest';
import {
  filterAIModelsByOperation,
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
