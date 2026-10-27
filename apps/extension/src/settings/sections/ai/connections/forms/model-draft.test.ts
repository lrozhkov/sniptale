import { expect, it } from 'vitest';
import type { AIModel } from '../../../../../contracts/settings';
import {
  applyCatalogModelDraft,
  clearModelIdentityClaims,
  createModelDraft,
  getModelCatalogEntries,
  updateDraftCapabilities,
} from './model-draft';
const model: AIModel = {
  id: 'model',
  providerId: 'provider',
  displayName: 'Manual name',
  modelCode: 'exact-code',
  source: 'manual',
  propertySource: 'manual',
  capabilities: { operations: { text: 'supported' }, input: {}, output: {}, features: {} },
  catalog: {
    displayName: 'Provider name',
    lifecycle: 'active',
    observedAt: 1,
    capabilities: {
      operations: { text: 'supported', speech: 'supported', transcription: 'supported' },
      input: { text: 'supported', audio: 'supported' },
      output: { text: 'supported', audio: 'supported' },
      features: { tools: 'supported' },
    },
  },
};
it('previews current provider facts without mutating the manual draft or provenance', () => {
  const draft = createModelDraft(model);
  const bound = applyCatalogModelDraft(draft, model);
  expect(bound.displayName).toBe('Provider name');
  expect(bound.propertySource).toBe('catalog');
  expect(bound.capabilities).toEqual(model.catalog?.capabilities);
  expect(bound.capabilities).not.toBe(model.catalog?.capabilities);
  expect(draft.displayName).toBe('Manual name');
  expect(draft.propertySource).toBe('manual');
});
it('clears prior capability, audio and retirement claims after an identity edit', () => {
  const draft = {
    ...createModelDraft(model),
    retirementOverride: true,
    audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' as const } },
  };
  const next = clearModelIdentityClaims(draft);
  expect(next.capabilities).toEqual({ operations: {}, input: {}, output: {}, features: {} });
  expect(next.audio).toBeUndefined();
  expect(next.retirementOverride).toBe(false);
  expect(next.propertySource).toBe('manual');
});
it('removes only execution parameters for operations explicitly removed from capabilities', () => {
  const draft = {
    ...createModelDraft(model),
    audio: {
      speech: { voiceId: 'voice', responseFormat: 'mp3' as const },
      transcription: { responseFormat: 'json' as const, timestampGranularity: 'none' as const },
    },
  };
  const next = updateDraftCapabilities(draft, {
    operations: { transcription: 'supported' },
    input: {},
    output: {},
    features: {},
  });
  expect(next.audio).toEqual({ transcription: draft.audio.transcription });
  expect(draft.audio.speech).toBeDefined();
});
it('does not carry an override or enabled flag into a retired catalog preview', () => {
  const next = applyCatalogModelDraft(
    { ...createModelDraft(model), retirementOverride: true, enabled: true },
    {
      ...model,
      catalog: { ...model.catalog!, lifecycle: 'retired' },
    }
  );
  expect(next.retirementOverride).toBe(false);
  expect(next.enabled).toBe(false);
});
it('scopes catalog choices to current present facts and keeps the stored configured identity', () => {
  const entries = getModelCatalogEntries(
    [
      model,
      { ...model, id: 'duplicate' },
      { ...model, id: 'foreign', providerId: 'other' },
      {
        ...model,
        id: 'missing',
        modelCode: 'absent',
        catalog: { ...model.catalog!, lifecycle: 'absent' },
      },
    ],
    model.providerId
  );
  expect(entries).toHaveLength(1);
  expect(entries[0]?.id).toBe(model.id);
  expect(entries[0]?.displayName).toBe('Provider name');
});
