import { expect, it } from 'vitest';
import type { AIModel } from '../settings';
import {
  parseSettingsTransferModelMetadata,
  selectSettingsTransferModelMetadata,
} from './model-metadata';

it('round trips legacy and configured audio models without sharing nested parameter references', () => {
  const models: AIModel[] = [
    { id: 'legacy', providerId: 'p', modelCode: 'text', displayName: 'Text' },
    {
      id: 'stt',
      providerId: 'p',
      modelCode: 'custom',
      displayName: 'Transcription',
      operation: 'transcription',
      audio: {
        transcription: {
          language: 'en',
          prompt: 'Names',
          responseFormat: 'verbose_json',
          timestampGranularity: 'segment',
        },
      },
    },
    {
      id: 'tts',
      providerId: 'p',
      modelCode: 'custom',
      displayName: 'Speech',
      operation: 'speech',
      audio: {
        speech: { voiceId: 'voice', responseFormat: 'mp3', speed: 0.8, instructions: 'Softly' },
      },
    },
  ];
  models.push({
    id: 'pcm',
    providerId: 'p',
    modelCode: 'generic-tts',
    displayName: 'PCM speech',
    operation: 'speech',
    audio: { speech: { voiceId: 'voice', responseFormat: 'pcm' } },
  });
  for (const model of models) {
    const exported = selectSettingsTransferModelMetadata(model);
    const restored = parseSettingsTransferModelMetadata(JSON.parse(JSON.stringify(exported)));
    expect(restored).toEqual(model);
    if (model.audio) expect(exported.audio).not.toBe(model.audio);
  }
});

it('rejects mismatched operations and unknown nested fields before import', () => {
  const model = {
    id: 'x',
    providerId: 'p',
    modelCode: 'custom',
    displayName: 'Speech',
    operation: 'speech',
  };
  expect(() => parseSettingsTransferModelMetadata(model)).toThrow();
  expect(() =>
    parseSettingsTransferModelMetadata({
      ...model,
      audio: { speech: { voiceId: 'voice', responseFormat: 'mp3', apiKey: 'untrusted' } },
    })
  ).toThrow();
});
