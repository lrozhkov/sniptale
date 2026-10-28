// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../../contracts/settings';

const { saveModelFormMock, saveProviderFormMock } = vi.hoisted(() => ({
  saveModelFormMock: vi.fn(),
  saveProviderFormMock: vi.fn(),
}));

vi.mock('./save', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./save')>()),
  saveModelForm: saveModelFormMock,
  saveProviderForm: saveProviderFormMock,
}));

import { useModelFormState, useProviderFormState } from './hooks';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestModelState: ReturnType<typeof useModelFormState> | null = null;
let latestProviderState: ReturnType<typeof useProviderFormState> | null = null;

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  displayName: 'GPT 4.1',
  modelCode: 'gpt-4.1',
  systemPrompt: 'Prompt',
};

function ProviderHarness(props: { provider?: AIProvider | null }) {
  latestProviderState = useProviderFormState(props.provider);
  return null;
}

function ModelHarness(props: {
  model?: AIModel | null;
  initialProviderId?: string;
  providers?: AIProvider[];
}) {
  latestModelState = useModelFormState(props.model, props.providers, [], props.initialProviderId);
  return null;
}

async function renderProviderHarness(provider?: AIProvider | null) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      provider === undefined ? <ProviderHarness /> : <ProviderHarness provider={provider} />
    );
  });
}

async function renderModelHarness(model?: AIModel | null) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(model === undefined ? <ModelHarness /> : <ModelHarness model={model} />);
  });
}

function resetProviderFormHooksMocks() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  saveModelFormMock.mockReset();
  saveProviderFormMock.mockReset();
  latestModelState = null;
  latestProviderState = null;
}

beforeEach(resetProviderFormHooksMocks);

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestModelState = null;
  latestProviderState = null;
  vi.unstubAllGlobals();
});

it('keeps provider secrets out of React form state and reads them from the input ref on submit', async () => {
  await renderProviderHarness(PROVIDER);

  expect(latestProviderState?.formData).toEqual({
    name: 'OpenAI',
    connectionType: 'openai-compatible',
    management: 'automatic',
    enabled: true,
    baseUrl: 'https://api.openai.com/v1',
  });
  expect('apiKey' in (latestProviderState?.formData ?? {})).toBe(false);

  const apiKeyInput = document.createElement('input');
  apiKeyInput.value = 'provider-secret';
  if (!latestProviderState?.apiKeyInputRef) {
    throw new Error('Expected provider API key ref');
  }
  const apiKeyInputRef = latestProviderState.apiKeyInputRef as {
    current: HTMLInputElement | null;
  };
  apiKeyInputRef.current = apiKeyInput;

  const preventDefault = vi.fn();
  const onSave = vi.fn();

  await act(async () => {
    await latestProviderState?.handleSubmit(
      { preventDefault } as unknown as React.FormEvent,
      onSave
    );
  });

  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(saveProviderFormMock).toHaveBeenCalledWith(
    expect.objectContaining({
      formData: {
        name: 'OpenAI',
        connectionType: 'openai-compatible',
        management: 'automatic',
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'provider-secret',
      },
      isEditing: true,
      onSave,
      provider: PROVIDER,
    })
  );
  expect('apiKey' in (latestProviderState?.formData ?? {})).toBe(false);
});

it('updates provider form fields in create mode without storing the API key in state', async () => {
  await renderProviderHarness(null);

  expect(latestProviderState?.isEditing).toBe(false);
  expect(latestProviderState?.formData).toEqual({
    name: '',
    connectionType: 'openai-compatible',
    management: 'automatic',
    enabled: true,
    baseUrl: '',
  });

  await act(async () => {
    latestProviderState?.handleChange('name')({
      target: { value: 'Local provider' },
    } as React.ChangeEvent<HTMLInputElement>);
    latestProviderState?.handleChange('baseUrl')({
      target: { value: 'http://127.0.0.1:11434/v1' },
    } as React.ChangeEvent<HTMLInputElement>);
    latestProviderState?.handleApiKeyChange({} as React.ChangeEvent<HTMLInputElement>);
  });

  expect(latestProviderState?.formData).toEqual({
    name: 'Local provider',
    connectionType: 'openai-compatible',
    management: 'automatic',
    enabled: true,
    baseUrl: 'http://127.0.0.1:11434/v1',
  });
  expect('apiKey' in (latestProviderState?.formData ?? {})).toBe(false);
});

it('persists model hook updates through saveModelForm with current form values', async () => {
  await renderModelHarness(MODEL);

  expect(latestModelState?.isEditing).toBe(true);
  expect(latestModelState?.formData).toEqual({
    providerId: 'provider-1',
    displayName: 'GPT 4.1',
    modelCode: 'gpt-4.1',
    systemPrompt: 'Prompt',
    source: 'manual',
    propertySource: 'manual',
    enabled: true,
    retirementOverride: false,
    capabilities: {
      operations: { text: 'supported' },
      input: { text: 'supported' },
      output: { text: 'supported' },
      features: {},
    },
  });

  await act(async () => {
    latestModelState?.handleChange('displayName')({
      target: { value: 'GPT 4.1 mini' },
    } as React.ChangeEvent<HTMLInputElement>);
    latestModelState?.handleProviderChange('provider-2');
  });

  expect(latestModelState?.formData).toEqual({
    providerId: 'provider-2',
    displayName: 'GPT 4.1 mini',
    modelCode: 'gpt-4.1',
    systemPrompt: 'Prompt',
    source: 'manual',
    propertySource: 'manual',
    enabled: true,
    retirementOverride: false,
    capabilities: { operations: {}, input: {}, output: {}, features: {} },
  });

  await act(async () => {
    await latestModelState?.handleSubmit(
      { preventDefault: vi.fn() } as unknown as React.FormEvent,
      vi.fn()
    );
  });

  expect(saveModelFormMock).toHaveBeenCalledWith(
    expect.objectContaining({
      formData: {
        providerId: 'provider-2',
        displayName: 'GPT 4.1 mini',
        modelCode: 'gpt-4.1',
        systemPrompt: 'Prompt',
        source: 'manual',
        propertySource: 'manual',
        enabled: true,
        retirementOverride: false,
        capabilities: { operations: {}, input: {}, output: {}, features: {} },
      },
      isEditing: true,
      model: MODEL,
    })
  );
});

it('omits optional provider and model params from save calls in create mode', async () => {
  await renderProviderHarness();
  await renderModelHarness();

  const onProviderSave = vi.fn();
  const onModelSave = vi.fn();

  await act(async () => {
    await latestProviderState?.handleSubmit(
      { preventDefault: vi.fn() } as unknown as React.FormEvent,
      onProviderSave
    );
    await latestModelState?.handleSubmit(
      { preventDefault: vi.fn() } as unknown as React.FormEvent,
      onModelSave
    );
  });

  expect(saveProviderFormMock).toHaveBeenCalledWith(
    expect.not.objectContaining({
      provider: expect.anything(),
    })
  );
  expect(saveModelFormMock).toHaveBeenCalledWith(
    expect.not.objectContaining({
      model: expect.anything(),
    })
  );
  expect(saveProviderFormMock).toHaveBeenCalledTimes(1);
  expect(saveModelFormMock).toHaveBeenCalledTimes(1);
});

it('keeps capabilities and other audio parameters when switching the execution view', async () => {
  await renderModelHarness(MODEL);
  const capabilities = latestModelState?.formData.capabilities;
  await act(async () => latestModelState?.handleOperationChange('speech'));
  expect(latestModelState?.formData.audio).toBeUndefined();
  await act(async () =>
    latestModelState?.handleAudioChange({
      speech: { voiceId: 'custom', responseFormat: 'wav', speed: 1.2 },
    })
  );
  await act(async () => latestModelState?.handleOperationChange('transcription'));
  await act(async () =>
    latestModelState?.handleAudioChange({
      transcription: { responseFormat: 'json', timestampGranularity: 'none' },
    })
  );
  await act(async () => latestModelState?.handleOperationChange('text'));
  expect(latestModelState?.formData.audio).toEqual({
    speech: { voiceId: 'custom', responseFormat: 'wav', speed: 1.2 },
    transcription: { responseFormat: 'json', timestampGranularity: 'none' },
  });
  expect(latestModelState?.formData.capabilities).toEqual(capabilities);
});

it('selects a named provider with its endpoint and clears a credential from the previous destination', async () => {
  await renderProviderHarness();
  const password = document.createElement('input');
  password.value = 'previous-provider-secret';
  if (latestProviderState) latestProviderState.apiKeyInputRef.current = password;
  await act(async () => latestProviderState?.handleConnectionTypeChange('neuraldeep'));
  expect(latestProviderState?.formData).toMatchObject({
    connectionType: 'neuraldeep',
    name: 'neuraldeep.ru',
    baseUrl: 'https://api.neuraldeep.ru/v1',
    management: 'automatic',
  });
  expect(password.value).toBe('');
  expect(latestProviderState?.formData).not.toHaveProperty('apiKey');
  await act(async () => latestProviderState?.handleManagementChange('manual'));
  expect(latestProviderState?.formData.management).toBe('manual');
});

it('captures the recovery provider incarnation without a model identity', async () => {
  await renderModelHarness();
  await act(async () =>
    root?.render(
      <ModelHarness
        key="recovery"
        providers={[{ ...PROVIDER, incarnation: 'current-provider' }]}
        initialProviderId={PROVIDER.id}
      />
    )
  );
  expect(latestModelState?.formData.providerId).toBe(PROVIDER.id);
  expect(latestModelState?.formData.modelCode).toBe('');
  expect(latestModelState?.isEditing).toBe(false);
  await act(async () =>
    latestModelState?.handleSubmit(
      { preventDefault: vi.fn() } as unknown as React.FormEvent,
      vi.fn()
    )
  );
  expect(saveModelFormMock).toHaveBeenCalledWith(
    expect.objectContaining({ providerIncarnation: 'current-provider', isEditing: false })
  );
});
