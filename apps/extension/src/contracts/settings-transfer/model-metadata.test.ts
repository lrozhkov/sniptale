import { expect, it } from 'vitest';
import type { AIModelCapabilities } from '../settings/ai-catalog';
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

const capabilities: AIModelCapabilities = {
  operations: { text: 'supported', transcription: 'supported', speech: 'supported' },
  input: { text: 'supported', audio: 'supported', image: 'unknown' },
  output: { text: 'supported', audio: 'supported' },
  features: { 'segment-timestamps': 'supported' },
  contextWindow: 32000,
  maxOutputTokens: 4096,
};

function configuredModel(): AIModel {
  return {
    id: 'configured',
    providerId: 'p',
    modelCode: 'exact/code',
    displayName: 'Configured',
    source: 'manual',
    propertySource: 'manual',
    enabled: false,
    retirementOverride: true,
    capabilities: structuredClone(capabilities),
    systemPrompt: '',
    operation: 'speech',
    audio: {
      transcription: {
        language: 'en',
        responseFormat: 'verbose_json',
        timestampGranularity: 'segment',
      },
      speech: { voiceId: 'voice', responseFormat: 'mp3', speed: 0.9, instructions: 'Quietly' },
    },
  };
}

it('round trips manual capabilities and both audio configurations', () => {
  const model = configuredModel();
  const exported = selectSettingsTransferModelMetadata(model);
  const restored = parseSettingsTransferModelMetadata(JSON.parse(JSON.stringify(exported)));
  expect(restored).toEqual(model);
  expect(exported.capabilities).not.toBe(model.capabilities);
  expect(restored.capabilities).not.toBe(exported.capabilities);
  expect(restored.audio).not.toBe(exported.audio);
});

it('retains catalog property ownership without exporting cached observations', () => {
  const model: AIModel = {
    ...configuredModel(),
    propertySource: 'catalog',
    retirementOverride: false,
    catalog: {
      capabilities,
      displayName: 'Remote',
      lifecycle: 'active',
      observedAt: 17,
      scope: 'private-scope',
    },
  };
  const { catalog: _catalog, ...configuration } = model;
  const exported = selectSettingsTransferModelMetadata(model);
  expect(exported).toEqual(configuration);
  expect(parseSettingsTransferModelMetadata(exported)).toEqual(configuration);
  expect(JSON.stringify(exported)).not.toContain('private-scope');
});

it.each([
  { source: 'unknown' },
  { propertySource: 'unknown' },
  { enabled: 'true' },
  { retirementOverride: 1 },
  { capabilities: { ...capabilities, input: { private: 'supported' } } },
  { capabilities: { ...capabilities, maxOutputTokens: -1 } },
  { capabilities: { ...capabilities, operations: { speech: 'supported' } } },
  { observation: { status: 'available' } },
])('rejects invalid portable controls: %j', (invalid) => {
  expect(() => parseSettingsTransferModelMetadata({ ...configuredModel(), ...invalid })).toThrow(
    TypeError
  );
});

it.each([
  { source: 'catalog' as const, propertySource: 'catalog' as const, retirementOverride: true },
  { source: 'manual' as const, propertySource: 'catalog' as const, retirementOverride: true },
  { source: 'manual' as const, propertySource: 'manual' as const, retirementOverride: false },
])('keeps retired models disabled without manual override: %j', (configuration) => {
  const model: AIModel = {
    ...configuredModel(),
    ...configuration,
    enabled: true,
    catalog: { capabilities, displayName: 'Retired', lifecycle: 'retired', observedAt: 17 },
  };
  const exported = selectSettingsTransferModelMetadata(model);
  expect(exported.enabled).toBe(false);
  expect(exported.catalog).toBeUndefined();
  expect(parseSettingsTransferModelMetadata(exported).enabled).toBe(false);
});

it('retains an explicit manual retirement override and blocks repeated absence', () => {
  const model: AIModel = {
    ...configuredModel(),
    enabled: true,
    catalog: { capabilities, displayName: 'Retired', lifecycle: 'retired', observedAt: 17 },
  };
  expect(selectSettingsTransferModelMetadata(model).enabled).toBe(true);
  model.catalog = { ...model.catalog!, lifecycle: 'absent', absenceCount: 2 };
  expect(selectSettingsTransferModelMetadata(model).enabled).toBe(false);
  model.catalog = { ...model.catalog, absenceCount: 1 };
  expect(selectSettingsTransferModelMetadata(model).enabled).toBe(true);
});
