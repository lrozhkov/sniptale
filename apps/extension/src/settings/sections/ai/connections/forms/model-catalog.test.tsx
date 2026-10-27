// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { useModelFormState } from './hooks';
const { addModel, updateModel } = vi.hoisted(() => ({ addModel: vi.fn(), updateModel: vi.fn() }));
vi.mock('../../../../runtime/ai-settings/mutations', async (original) => ({
  ...(await original<typeof import('../../../../runtime/ai-settings/mutations')>()),
  addAIModel: addModel,
  updateAIModel: updateModel,
}));
const provider: AIProvider = {
  id: '00000000-0000-4000-8000-000000000001',
  incarnation: 'first',
  name: 'Provider',
  connectionType: 'openai-compatible',
  baseUrl: 'https://provider.test/v1',
  hasStoredApiKey: false,
  createdAt: 1,
};
const catalog: AIModel = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: provider.id,
  modelCode: 'provider/exact-code',
  displayName: 'Provider model',
  source: 'catalog',
  capabilities: {
    operations: { text: 'supported', transcription: 'supported', speech: 'supported' },
    input: { audio: 'supported', text: 'supported' },
    output: { text: 'supported', audio: 'supported' },
    features: {},
  },
};
catalog.catalog = {
  displayName: catalog.displayName,
  capabilities: catalog.capabilities!,
  lifecycle: 'active',
  observedAt: 1,
};
let state: ReturnType<typeof useModelFormState>;
let root: Root;
let container: HTMLDivElement;
function Harness(props: { provider: AIProvider; models: AIModel[]; model?: AIModel }) {
  state = useModelFormState(props.model, [props.provider], props.models);
  return null;
}
async function render(models = [catalog], currentProvider = provider, model?: AIModel) {
  await act(async () =>
    root.render(
      <Harness provider={currentProvider} models={models} {...(model ? { model } : {})} />
    )
  );
}
async function choose() {
  await act(async () => state.handleProviderChange(provider.id));
  await act(async () => state.handleCatalogSelect(catalog.id));
}
async function save() {
  await act(async () =>
    state.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent, vi.fn())
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  addModel.mockReset().mockResolvedValue(undefined);
  updateModel.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('chooses catalog properties and configures the existing identity without creating a duplicate', async () => {
  await render();
  expect(state.entryMode).toBe('catalog');
  expect(addModel).not.toHaveBeenCalled();
  await choose();
  expect(state.formData.capabilities).toEqual(catalog.catalog?.capabilities);
  expect(state.formData.propertySource).toBe('catalog');
  await save();
  expect(addModel).not.toHaveBeenCalled();
  expect(updateModel).toHaveBeenCalledWith(
    expect.objectContaining({
      id: catalog.id,
      modelCode: catalog.modelCode,
      source: 'manual',
      propertySource: 'catalog',
    }),
    'first'
  );
});
it('copies catalog properties and previews fresh facts only after explicit reset', async () => {
  await render();
  await choose();
  await act(async () => state.handleManualEntry());
  await act(async () =>
    state.handleChange('displayName')({
      target: { value: 'My name' },
    } as React.ChangeEvent<HTMLInputElement>)
  );
  const refreshed = {
    ...catalog,
    displayName: 'New provider name',
    catalog: { ...catalog.catalog!, displayName: 'New provider name', observedAt: 2 },
  };
  await render([refreshed]);
  expect(state.formData.displayName).toBe('My name');
  expect(state.formData.propertySource).toBe('manual');
  await act(async () => state.handleResetFromCatalog());
  expect(state.formData.displayName).toBe('New provider name');
  expect(state.entryMode).toBe('catalog');
  expect(updateModel).not.toHaveBeenCalled();
});
it('retains a manual draft when reset has no current catalog entry', async () => {
  await render();
  await choose();
  await act(async () => state.handleManualEntry());
  const draft = structuredClone(state.formData);
  await render([]);
  await act(async () => state.handleResetFromCatalog());
  expect(state.catalogModel).toBeUndefined();
  expect(state.formData).toEqual(draft);
});
it('clears prior facts on a code edit and does not recreate claims while typing', async () => {
  await render();
  await choose();
  await act(async () => state.handleManualEntry());
  await act(async () =>
    state.handleChange('modelCode')({
      target: { value: 'different' },
    } as React.ChangeEvent<HTMLInputElement>)
  );
  expect(state.formData.capabilities).toEqual({
    operations: {},
    input: {},
    output: {},
    features: {},
  });
  expect(state.catalogModel).toBeUndefined();
  await save();
  expect(updateModel).toHaveBeenCalledWith(
    expect.objectContaining({ id: catalog.id, modelCode: 'different', propertySource: 'manual' }),
    'first'
  );
});
it('retains the captured connection incarnation until explicit provider reselection', async () => {
  await render();
  await choose();
  await render([catalog], { ...provider, incarnation: 'second' });
  await save();
  expect(updateModel).toHaveBeenLastCalledWith(expect.anything(), 'first');
  await act(async () => state.handleProviderChange(provider.id));
  await act(async () =>
    state.handleChange('displayName')({
      target: { value: 'Edited after reselection' },
    } as React.ChangeEvent<HTMLInputElement>)
  );
  await save();
  expect(updateModel).toHaveBeenLastCalledWith(expect.anything(), 'second');
});
it.each([{ lifecycle: 'retired' as const }, { lifecycle: 'deprecated' as const, retirementAt: 1 }])(
  'keeps retirement permission explicit for %j',
  async (facts) => {
    await render([{ ...catalog, catalog: { ...catalog.catalog!, ...facts } }]);
    await choose();
    expect(state.formData.enabled).toBe(false);
    expect(state.formData.retirementOverride).toBe(false);
    expect(state.lifecycle).toBe('retired');
    await act(async () => state.handleManualEntry());
    await act(async () => state.handleRetirementOverrideChange(true));
    expect(state.formData.enabled).toBe(false);
    await act(async () => state.handleEnabledChange(true));
    await save();
    expect(updateModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: catalog.id,
        enabled: true,
        propertySource: 'manual',
        retirementOverride: true,
      }),
      'first'
    );
  }
);
it('accepts catalog IDs and copied names up to the provider contract limit', async () => {
  const long = {
    ...catalog,
    modelCode: 'c'.repeat(500),
    displayName: 'n'.repeat(500),
    catalog: { ...catalog.catalog!, displayName: 'n'.repeat(500) },
  };
  await render([long]);
  await choose();
  await save();
  expect(state.errors).toEqual({});
  expect(updateModel).toHaveBeenCalledWith(
    expect.objectContaining({ modelCode: long.modelCode, displayName: long.displayName }),
    'first'
  );
});

it('keeps a previously disabled configured identity disabled until the user enables it', async () => {
  await render([{ ...catalog, enabled: false }]);
  await choose();
  expect(state.formData.enabled).toBe(false);
  await save();
  expect(updateModel).toHaveBeenCalledWith(
    expect.objectContaining({ id: catalog.id, enabled: false }),
    'first'
  );
});
