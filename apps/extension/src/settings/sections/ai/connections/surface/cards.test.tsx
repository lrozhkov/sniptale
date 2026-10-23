// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import type { AiProvidersSectionState } from '../controller/types';
import { AIProvidersModelsCard } from './models-card';
import { AIProvidersProvidersCard } from './cards';
import { AIProvidersChromeAiCard } from './chrome-ai-card';
import { createMockChromeAiState, createMockSecretProtectionState } from './test-support';

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
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: 'Prompt',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

function createState(overrides: Partial<AiProvidersSectionState> = {}): AiProvidersSectionState {
  return {
    catalogActions: {
      clearProviderSecret: vi.fn().mockResolvedValue(undefined),
      deleteModel: vi.fn().mockResolvedValue(undefined),
      deleteProvider: vi.fn().mockResolvedValue(undefined),
      moveModel: vi.fn().mockResolvedValue(undefined),
      setDefaultModel: vi.fn().mockResolvedValue(undefined),
    },
    chromeAi: createMockChromeAiState(),
    secretProtection: createMockSecretProtectionState(),
    providers: [PROVIDER],
    models: [MODEL],
    defaultModelId: 'model-1',
    isLoading: false,
    modelOptions: [],
    modals: {
      provider: { open: false },
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
    ...overrides,
  };
}

function getButtons() {
  return Array.from(container?.querySelectorAll('button') ?? []);
}

async function openFirstActionMenu() {
  await act(async () => {
    getButtons()
      .find(
        (button) =>
          button.getAttribute('aria-label') === translate('settings.collection.actions.menu')
      )
      ?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

it('maps model reorder intents to the model order owner', async () => {
  const state = createState({
    models: [MODEL, { ...MODEL, id: 'model-2', displayName: 'GPT 4.2' }],
  });
  await renderUi(<AIProvidersModelsCard state={state} />);

  const firstDragHandle = container?.querySelector<HTMLElement>(
    `[aria-label="${translate('settings.collection.dragHandle')}"]`
  );
  expect(firstDragHandle).toBeTruthy();

  await openFirstActionMenu();
  await act(async () => {
    getButtons()
      .find(
        (button) =>
          button.getAttribute('aria-label') === translate('settings.collection.actions.moveDown')
      )
      ?.click();
  });
  expect(state.catalogActions.moveModel).toHaveBeenCalledWith('model-1', null);
});

it('keeps model handles and focus during a pending pointer move and restores order on rejection', async () => {
  let rejectMove!: (reason: Error) => void;
  const state = createState({
    models: [MODEL, { ...MODEL, id: 'model-2', displayName: 'GPT 4.2' }],
  });
  state.catalogActions.moveModel = vi.fn(
    () =>
      new Promise<boolean>((_resolve, reject) => {
        rejectMove = reject;
      })
  );
  const originalBounds = HTMLElement.prototype.getBoundingClientRect;
  const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  HTMLElement.prototype.getBoundingClientRect = function () {
    const row = this.closest<HTMLElement>('[data-settings-collection-item]');
    const rows = [...(container?.querySelectorAll('[data-settings-collection-item]') ?? [])];
    return { left: 0, top: row ? rows.indexOf(row) * 52 : 0, height: 52 } as DOMRect;
  };
  try {
    await renderUi(<AIProvidersModelsCard state={state} />);
    const handles = () =>
      container!.querySelectorAll<HTMLButtonElement>(
        `[aria-label="${translate('settings.collection.dragHandle')}"]`
      );
    const source = handles()[0]!;
    const second = container!.querySelector('[data-settings-collection-item="model-2"]');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => second,
    });
    const pointer = (type: string, clientY = 0) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      source.dispatchEvent(event);
    };
    act(() => source.focus());
    act(() => pointer('pointerdown'));
    act(() => pointer('pointermove', 100));
    act(() => pointer('pointerup', 100));
    expect(state.catalogActions.moveModel).toHaveBeenCalledTimes(1);
    expect(handles()).toHaveLength(2);
    expect(source.isConnected).toBe(true);
    expect(document.activeElement).toBe(source);
    expect(source.getAttribute('aria-disabled')).toBe('true');
    await act(async () => rejectMove(new Error('Move failed')));
    expect(
      container!
        .querySelector('[data-settings-collection-item]')
        ?.getAttribute('data-settings-collection-item')
    ).toBe('model-1');
    expect(handles()[0]).toBe(source);
    expect(document.activeElement).toBe(source);
    expect(source.getAttribute('aria-disabled')).not.toBe('true');
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalBounds;
    if (originalElementFromPoint)
      Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
    else Reflect.deleteProperty(document, 'elementFromPoint');
  }
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('renders provider rows and wires provider add, edit, and delete callbacks', async () => {
  const state = createState();
  await renderUi(<AIProvidersProvidersCard state={state} />);

  expect(container?.textContent).toContain('OpenAI');
  expect(container?.textContent).toContain('openai-compatible');

  await openFirstActionMenu();

  await act(async () => {
    getButtons()
      .find((button) => button.textContent === translate('common.actions.add'))
      ?.click();
    getButtons()
      .find(
        (button) =>
          button.getAttribute('aria-label') === translate('settings.collection.actions.edit')
      )
      ?.click();
    getButtons()
      .find((button) => button.textContent === translate('settings.collection.actions.delete'))
      ?.click();
  });

  expect(state.modals.openProviderModal).toHaveBeenCalledTimes(2);
  expect(state.modals.openProviderModal).toHaveBeenCalledWith(PROVIDER);
  expect(state.modals.setConfirmDelete).toHaveBeenCalledWith({ type: 'provider', item: PROVIDER });
});

it('renders a compact clear-secret action only for providers with a stored key', async () => {
  const state = createState();
  await renderUi(<AIProvidersProvidersCard state={state} />);

  await openFirstActionMenu();

  await act(async () => {
    getButtons()
      .find(
        (button) =>
          button.textContent === translate('settings.aiProviders.providerSecretClearAction')
      )
      ?.click();
  });

  expect(state.catalogActions.clearProviderSecret).toHaveBeenCalledWith('provider-1');

  await renderUi(
    <AIProvidersProvidersCard
      state={createState({
        providers: [{ ...PROVIDER, hasStoredApiKey: false }],
      })}
    />
  );

  expect(
    getButtons().some(
      (button) => button.textContent === translate('settings.aiProviders.providerSecretClearAction')
    )
  ).toBe(false);
});

it('renders model rows, default actions, and empty states when providers are unavailable', async () => {
  const state = createState({ defaultModelId: null });
  await renderUi(<AIProvidersModelsCard state={state} />);

  expect(container?.textContent).toContain('GPT 4.1');

  await openFirstActionMenu();

  await act(async () => {
    getButtons()
      .find((button) => button.textContent === translate('common.actions.add'))
      ?.click();
    getButtons()
      .find((button) => button.textContent === translate('settings.collection.actions.setDefault'))
      ?.click();
    getButtons()
      .find(
        (button) =>
          button.getAttribute('aria-label') === translate('settings.collection.actions.edit')
      )
      ?.click();
    getButtons()
      .find((button) => button.textContent === translate('settings.collection.actions.delete'))
      ?.click();
  });

  expect(state.modals.openModelModal).toHaveBeenCalledTimes(2);
  expect(state.modals.openModelModal).toHaveBeenCalledWith(MODEL);
  expect(state.catalogActions.setDefaultModel).toHaveBeenCalledWith('model-1');
  expect(state.modals.setConfirmDelete).toHaveBeenCalledWith({ type: 'model', item: MODEL });

  const emptyState = createState({
    providers: [],
    models: [],
    getProviderName: vi.fn(() => 'Unknown'),
  });
  await renderUi(<AIProvidersModelsCard state={emptyState} />);

  expect(container?.textContent).toContain(translate('settings.aiProviders.modelsEmptyTitle'));
  expect(container?.textContent).toContain(
    translate('settings.aiProviders.modelsEmptyDescriptionNoProviders')
  );
  expect(getButtons()[0]?.hasAttribute('disabled')).toBe(true);
});

it('renders chrome-ai status copy for setup, enabled, and unsupported states', async () => {
  const settingUpState = createState({
    chromeAi: {
      ...createMockChromeAiState(),
      availability: 'downloadable',
      isSettingUp: true,
      setupProgress: 42,
    },
  });
  await renderUi(<AIProvidersChromeAiCard state={settingUpState} />);

  expect(container?.textContent).toContain(translate('settings.aiProviders.chromeAiPreparing'));
  expect(container?.textContent).toContain('42%');

  const enabledState = createState({
    chromeAi: {
      ...createMockChromeAiState(),
      enabled: true,
    },
  });
  await renderUi(<AIProvidersChromeAiCard state={enabledState} />);
  expect(container?.textContent).toContain(
    translate('settings.aiProviders.chromeAiEnabledDescription')
  );

  const unsupportedState = createState({
    chromeAi: {
      ...createMockChromeAiState(),
      availability: 'unsupported',
    },
  });
  await renderUi(<AIProvidersChromeAiCard state={unsupportedState} />);
  expect(getButtons()[0]?.hasAttribute('disabled')).toBe(true);
  expect(container?.textContent).toContain(translate('settings.aiProviders.chromeAiUnsupported'));
});

it('runs the Chrome AI diagnostic only when the integration is enabled', async () => {
  const chromeAi = { ...createMockChromeAiState(), enabled: true };
  await renderUi(<AIProvidersChromeAiCard state={createState({ chromeAi })} />);

  await act(async () => {
    getButtons()
      .find((button) => button.textContent === translate('settings.aiProviders.chromeAiTestAction'))
      ?.click();
  });
  expect(chromeAi.handleTest).toHaveBeenCalledOnce();

  await renderUi(
    <AIProvidersChromeAiCard
      state={createState({ chromeAi: { ...createMockChromeAiState(), enabled: false } })}
    />
  );
  expect(
    getButtons().find(
      (button) => button.textContent === translate('settings.aiProviders.chromeAiTestAction')
    )?.disabled
  ).toBe(true);
});
