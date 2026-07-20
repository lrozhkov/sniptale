import { describe, expect, it } from 'vitest';
import type { AIModel } from '../../contracts/settings';

import { resolveSelectedAIModelId, reconcileSelectedAIModelId } from './selection';

function createAvailableModels(ids: string[]): AIModel[] {
  return ids.map((id) => ({
    displayName: id,
    id,
    modelCode: id,
    providerId: 'provider-1',
    systemPrompt: '',
  }));
}

describe('resolveSelectedAIModelId', () => {
  it('keeps a valid stored default model id and falls back to the first available model', () => {
    expect(resolveSelectedAIModelId([], 'model-1')).toBeNull();
    expect(resolveSelectedAIModelId(createAvailableModels(['model-1']), 'model-1')).toBe('model-1');
    expect(
      resolveSelectedAIModelId(createAvailableModels(['model-1', 'model-2']), 'model-missing')
    ).toBe('model-1');
  });
});

describe('reconcileSelectedAIModelId', () => {
  it('resolves fallbacks without writing during read-path reconciliation', async () => {
    await expect(reconcileSelectedAIModelId([], 'model-missing')).resolves.toBeNull();

    await expect(
      reconcileSelectedAIModelId(createAvailableModels(['model-1']), 'model-missing')
    ).resolves.toBe('model-1');
  });
});
