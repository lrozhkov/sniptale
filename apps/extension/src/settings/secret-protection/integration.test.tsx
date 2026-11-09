// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SettingsSecretProtectionProvider, useSettingsSecretProtection } from './context';
import { translate } from '../../platform/i18n';
import type { AIModel, AIProvider } from '../../contracts/settings';
import type { AiProvidersSectionState } from '../sections/ai/connections/controller/types';
import { AIProvidersSectionContent } from '../sections/ai/connections/surface/content';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: false,
  createdAt: 1,
};

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: '',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(): AiProvidersSectionState {
  return {
    catalogActions: {
      clearProviderSecret: vi.fn().mockResolvedValue(undefined),
      deleteModel: vi.fn().mockResolvedValue(undefined),
      deleteProvider: vi.fn().mockResolvedValue(undefined),
      moveModel: vi.fn().mockResolvedValue(undefined),
    },
    chromeAi: {
      availability: 'available',
      enabled: false,
      error: null,
      handleTest: vi.fn().mockResolvedValue(undefined),
      handleToggle: vi.fn().mockResolvedValue(undefined),
      isChecking: false,
      isSettingUp: false,
      setupProgress: null,
      testStatus: 'idle',
    },
    secretProtection: { ensureUnlocked: vi.fn().mockResolvedValue(undefined) },
    providers: [PROVIDER],
    models: [MODEL],
    catalogModels: [],
    isLoading: false,
    modelOptions: [],
    modals: {
      provider: { open: true, provider: PROVIDER },
      model: { open: false },
      confirmDelete: null,
      openProviderModal: vi.fn(),
      closeProviderModal: vi.fn(),
      openModelModal: vi.fn(),
      closeModelModal: vi.fn(),
      setConfirmDelete: vi.fn(),
    },
    reloadData: vi.fn().mockResolvedValue(undefined),
    getProviderName: vi.fn(() => 'OpenAI'),
  };
}

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../runtime/messaging', () => ({
  settingsRuntimeMessagingTransport: { sendRuntimeMessage: mocks.send },
}));
let unlock: (() => Promise<void>) | null = null;
let refresh: (() => Promise<void>) | null = null;
function ProviderContent() {
  const shared = useSettingsSecretProtection();
  const state = createState();
  state.secretProtection = { ensureUnlocked: () => shared.ensureUnlocked('ai') };
  unlock = state.secretProtection.ensureUnlocked;
  refresh = shared.reloadStatus;
  return <AIProvidersSectionContent state={state} />;
}
async function renderUi() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <SettingsSecretProtectionProvider onOpenConfiguration={vi.fn()}>
        <ProviderContent />
      </SettingsSecretProtectionProvider>
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({
    success: true,
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase',
      participants: { ai: true, webdav: false },
    },
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('renders the passphrase unlock dialog after the provider modal root', async () => {
  await renderUi();

  let pending: Promise<void> | undefined;
  act(() => {
    pending = unlock?.();
    pending?.catch(() => undefined);
  });
  const markup = container?.innerHTML ?? '';
  expect(markup.indexOf(translate('settings.aiProviders.providerModalEditTitle'))).toBeLessThan(
    markup.indexOf(translate('settings.secretProtection.unlockTitle'))
  );
});

function enter(input: HTMLInputElement | null, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('preserves the unsubmitted provider draft through shared unlock and cancellation', async () => {
  await renderUi();
  const name =
    container?.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('settings.aiProviders.providerNameLabel')}"]`
    ) ?? null;
  const apiKey =
    container?.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('settings.aiProviders.providerApiKeyLabel')}"]`
    ) ?? null;
  expect(name).not.toBeNull();
  expect(apiKey).not.toBeNull();
  enter(name, 'Unsubmitted provider draft');
  enter(apiKey, 'draft-api-key');
  let outcome: Promise<string> | undefined;
  act(() => {
    outcome = unlock?.().then(
      () => 'unlocked',
      () => 'cancelled'
    );
  });
  expect(name?.value).toBe('Unsubmitted provider draft');
  expect(apiKey?.value).toBe('draft-api-key');
  const unlockDialog = Array.from(container?.querySelectorAll('[role="dialog"]') ?? []).at(-1);
  const cancel = Array.from(unlockDialog?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === translate('common.actions.cancel')
  );
  act(() => cancel?.click());
  expect(await outcome).toBe('cancelled');
  expect(name?.value).toBe('Unsubmitted provider draft');
  expect(apiKey?.value).toBe('draft-api-key');
  act(() => {
    outcome = unlock?.().then(
      () => 'unlocked',
      () => 'cancelled'
    );
  });
  const commonDialog = Array.from(container?.querySelectorAll('[role="dialog"]') ?? []).at(-1);
  enter(commonDialog?.querySelector<HTMLInputElement>('input') ?? null, 'current shared phrase');
  mocks.send.mockImplementation(async (message: { operation: string }) => ({
    success: true,
    ...(message.operation === 'read-secret-protection-status'
      ? {
          secretProtectionStatus: {
            isEnabled: true,
            isUnlocked: true,
            mode: 'passphrase',
            participants: { ai: true, webdav: false },
          },
        }
      : {}),
  }));
  await act(async () =>
    commonDialog
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(await outcome).toBe('unlocked');
  expect(name?.value).toBe('Unsubmitted provider draft');
  expect(apiKey?.value).toBe('draft-api-key');
  expect(mocks.send).not.toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'update-provider' })
  );
});

it('preserves the current provider draft when a fresh common status read fails and retries', async () => {
  await renderUi();
  const name =
    container?.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('settings.aiProviders.providerNameLabel')}"]`
    ) ?? null;
  const apiKey =
    container?.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('settings.aiProviders.providerApiKeyLabel')}"]`
    ) ?? null;
  enter(name, 'Draft during status retry');
  enter(apiKey, 'draft-secret-retained-locally');
  mocks.send.mockRejectedValueOnce(new Error('fresh status unavailable'));
  await act(async () => refresh?.());
  expect(name?.value).toBe('Draft during status retry');
  expect(apiKey?.value).toBe('draft-secret-retained-locally');
  await act(async () => refresh?.());
  expect(name?.value).toBe('Draft during status retry');
  expect(apiKey?.value).toBe('draft-secret-retained-locally');
});
