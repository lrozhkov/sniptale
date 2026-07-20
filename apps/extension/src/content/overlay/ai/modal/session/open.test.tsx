// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';
import { useRef } from 'react';

const { loggerErrorMock, reconcileSelectedAIModelIdMock, requestAIModelSelectionBootstrapMock } =
  vi.hoisted(() => ({
    loggerErrorMock: vi.fn(),
    reconcileSelectedAIModelIdMock: vi.fn(),
    requestAIModelSelectionBootstrapMock: vi.fn(),
  }));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: requestAIModelSelectionBootstrapMock,
}));

vi.mock('../../../../../features/ai/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/ai/selection')>()),
  reconcileSelectedAIModelId: reconcileSelectedAIModelIdMock,
}));

import { useAIModalOpenBootstrapEffect } from './open';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createOpenProps(
  overrides: Partial<Parameters<typeof useAIModalOpenBootstrapEffect>[0]> = {}
) {
  return {
    bootedWhileOpenRef: { current: false },
    isOpen: true,
    lastPrompt: 'stored prompt',
    prompt: '',
    setAvailableModels: vi.fn(),
    setGlobalSystemPrompt: vi.fn(),
    setPrompt: vi.fn(),
    setProviders: vi.fn(),
    setSelectedModelId: vi.fn(),
    textareaRef: { current: null } as RefObject<HTMLTextAreaElement | null>,
    ...overrides,
  };
}

function OpenHarness(props: Parameters<typeof useAIModalOpenBootstrapEffect>[0]) {
  useAIModalOpenBootstrapEffect(props);
  return null;
}

function OpenHarnessWithRef(
  props: Omit<Parameters<typeof useAIModalOpenBootstrapEffect>[0], 'bootedWhileOpenRef'>
) {
  const bootedWhileOpenRef = useRef(false);
  useAIModalOpenBootstrapEffect({ ...props, bootedWhileOpenRef });
  return null;
}

async function renderHarness(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
  }

  if (!root && container) {
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

async function flushBootstrap() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function bootstrapHarness(props: Parameters<typeof createOpenProps>[0] = {}) {
  const openProps = createOpenProps(props);

  await renderHarness(<OpenHarness {...openProps} />);
  await flushBootstrap();

  return openProps;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  requestAIModelSelectionBootstrapMock.mockReset();
  loggerErrorMock.mockReset();
  reconcileSelectedAIModelIdMock.mockReset();
  requestAIModelSelectionBootstrapMock.mockResolvedValue({
    chromeAiEnabled: false,
    defaultModelId: 'model-1',
    globalSystemPrompt: 'Global system prompt',
    models: [{ id: 'model-1', name: 'Model 1', provider: 'openai' }],
    providers: [
      {
        connectionType: 'openai-compatible',
        createdAt: 1,
        destinationKind: 'external',
        hasStoredApiKey: true,
        id: 'openai',
        name: 'OpenAI',
      },
    ],
  });
  reconcileSelectedAIModelIdMock.mockResolvedValue('model-1');
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('hydrates prompt, focus, and bootstrap settings on first open', async () => {
  const focusMock = vi.fn();
  const props = await bootstrapHarness({
    textareaRef: {
      current: { focus: focusMock } as unknown as HTMLTextAreaElement,
    },
  });
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
  });

  expect(props.bootedWhileOpenRef.current).toBe(true);
  expect(props.setPrompt).toHaveBeenCalledWith('stored prompt');
  expect(props.setAvailableModels).toHaveBeenCalledWith([
    { id: 'model-1', name: 'Model 1', provider: 'openai' },
  ]);
  expect(props.setGlobalSystemPrompt).toHaveBeenCalledWith('Global system prompt');
  expect(props.setProviders).toHaveBeenCalledWith([
    {
      connectionType: 'openai-compatible',
      createdAt: 1,
      destinationKind: 'external',
      hasStoredApiKey: true,
      id: 'openai',
      name: 'OpenAI',
    },
  ]);
  expect(props.setSelectedModelId).toHaveBeenCalledWith('model-1');
  expect(focusMock).toHaveBeenCalledTimes(1);
});

it('skips prompt hydration when local prompt state is already populated', async () => {
  const props = await bootstrapHarness({
    prompt: 'already typed',
  });

  expect(props.setPrompt).not.toHaveBeenCalled();
});

it('falls back to the first available model when no valid stored default exists', async () => {
  requestAIModelSelectionBootstrapMock.mockResolvedValue({
    chromeAiEnabled: false,
    defaultModelId: null,
    globalSystemPrompt: 'Global system prompt',
    models: [{ id: 'model-2', name: 'Model 2', provider: 'openai' }],
    providers: [],
  });
  reconcileSelectedAIModelIdMock.mockResolvedValue('model-2');

  const props = await bootstrapHarness();

  expect(reconcileSelectedAIModelIdMock).toHaveBeenCalledWith(
    [{ id: 'model-2', name: 'Model 2', provider: 'openai' }],
    null
  );
  expect(props.setSelectedModelId).toHaveBeenCalledWith('model-2');
});

it('replaces a stale stored default with the first available model id', async () => {
  requestAIModelSelectionBootstrapMock.mockResolvedValue({
    chromeAiEnabled: false,
    defaultModelId: 'model-missing',
    globalSystemPrompt: 'Global system prompt',
    models: [{ id: 'model-3', name: 'Model 3', provider: 'openai' }],
    providers: [],
  });
  reconcileSelectedAIModelIdMock.mockResolvedValue('model-3');

  const props = await bootstrapHarness();

  expect(reconcileSelectedAIModelIdMock).toHaveBeenCalledWith(
    [{ id: 'model-3', name: 'Model 3', provider: 'openai' }],
    'model-missing'
  );
  expect(props.setSelectedModelId).toHaveBeenCalledWith('model-3');
});

describe('useAIModalOpenBootstrapEffect reload guard', () => {
  it('skips bootstrap reload after the first boot while still open', async () => {
    const props = createOpenProps();

    await renderHarness(<OpenHarnessWithRef {...props} />);
    await act(async () => {
      await Promise.resolve();
    });

    await renderHarness(<OpenHarnessWithRef {...props} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(requestAIModelSelectionBootstrapMock).toHaveBeenCalledTimes(1);
  });
});

describe('useAIModalOpenBootstrapEffect cleanup', () => {
  it('logs bootstrap errors and skips state writes after unmount cleanup', async () => {
    let resolveBootstrap:
      | ((value: Awaited<ReturnType<typeof requestAIModelSelectionBootstrapMock>>) => void)
      | null = null;

    requestAIModelSelectionBootstrapMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve;
        })
    );

    const props = createOpenProps();

    await renderHarness(<OpenHarness {...props} />);
    act(() => {
      root?.unmount();
      root = null;
    });

    await act(async () => {
      resolveBootstrap?.({
        chromeAiEnabled: false,
        defaultModelId: 'late-model',
        globalSystemPrompt: 'Global system prompt',
        models: [{ id: 'late-model', name: 'Late Model', provider: 'openai' }],
        providers: [],
      });
      await Promise.resolve();
    });

    expect(props.setAvailableModels).not.toHaveBeenCalled();
    expect(props.setProviders).not.toHaveBeenCalled();
    expect(props.setSelectedModelId).not.toHaveBeenCalled();

    requestAIModelSelectionBootstrapMock.mockRejectedValueOnce(new Error('bootstrap failed'));
    const errorProps = createOpenProps();

    await renderHarness(<OpenHarness {...errorProps} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock.mock.calls[0]?.[0]).toBe('Failed to load AI settings.');
  });
});
