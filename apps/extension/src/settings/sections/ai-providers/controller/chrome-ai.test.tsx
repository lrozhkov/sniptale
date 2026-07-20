// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAiProvidersChromeAiState } from './chrome-ai';
import { ChromeAiRuntimeError } from '@sniptale/platform/browser/chrome-ai';
import { translate } from '../../../../platform/i18n';

const chromeAiControllerMocks = vi.hoisted(() => ({
  loadChromeAiAvailabilityMock: vi.fn(),
  prepareChromeAiSessionMock: vi.fn(),
  saveChromeAiEnabledMock: vi.fn(),
  saveAiProvidersDefaultModelMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/chrome-ai', () => ({
  ChromeAiAvailability: undefined,
  ChromeAiCapability: undefined,
  ChromeAiRuntimeErrorReason: undefined,
  ChromeAiRuntimeError: class ChromeAiRuntimeError extends Error {
    readonly reason: 'unexpected' | 'unsupported';

    constructor(reason: 'unexpected' | 'unsupported') {
      super(`chrome-ai:${reason}`);
      this.reason = reason;
    }
  },
  createChromeAiSession: vi.fn(),
  createChromeAiSystemPromptMessage: vi.fn(),
  loadChromeAiAvailability: chromeAiControllerMocks.loadChromeAiAvailabilityMock,
  prepareChromeAiSession: chromeAiControllerMocks.prepareChromeAiSessionMock,
}));

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  saveChromeAiEnabled: chromeAiControllerMocks.saveChromeAiEnabledMock,
}));

vi.mock('./save', () => ({
  saveAiProvidersDefaultModel: chromeAiControllerMocks.saveAiProvidersDefaultModelMock,
  saveAiProvidersGlobalPrompt: vi.fn(),
  saveAiProvidersScenarioEditorPrompt: vi.fn(),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  hideAllToasts: vi.fn(),
  showToast: vi.fn(),
  toast: {
    error: chromeAiControllerMocks.toastErrorMock,
    success: chromeAiControllerMocks.toastSuccessMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  Logger: undefined,
  createLogger: () => ({
    error: chromeAiControllerMocks.loggerErrorMock,
  }),
  isTraceEnabled: vi.fn(),
}));

type HookArgs = Parameters<typeof useAiProvidersChromeAiState>[0];

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useAiProvidersChromeAiState> | null = null;
let latestArgs: HookArgs;

function Harness() {
  latestState = useAiProvidersChromeAiState(latestArgs);
  return null;
}

async function renderHarness(args: HookArgs) {
  latestArgs = args;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    chromeAiEnabled: false,
    defaultModelId: null,
    models: [
      { id: 'remote-model', providerId: 'provider-1', modelCode: 'gpt', displayName: 'GPT' },
    ],
    reloadData: vi.fn().mockResolvedValue(undefined),
    setChromeAiEnabled: vi.fn(),
    setDefaultModelId: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  chromeAiControllerMocks.loadChromeAiAvailabilityMock.mockResolvedValue('available');
  chromeAiControllerMocks.prepareChromeAiSessionMock.mockResolvedValue(undefined);
  chromeAiControllerMocks.saveChromeAiEnabledMock.mockResolvedValue(undefined);
  chromeAiControllerMocks.saveAiProvidersDefaultModelMock.mockResolvedValue(true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  latestState = null;
  vi.unstubAllGlobals();
});

it('loads availability on mount and exposes the settled runtime state', async () => {
  await renderHarness(createArgs());
  await flushEffects();

  expect(latestState).toMatchObject({
    availability: 'available',
    enabled: false,
    error: null,
    isChecking: false,
    isSettingUp: false,
    setupProgress: null,
  });
});

it('enables chrome-ai through setup/download flow and refreshes runtime data', async () => {
  chromeAiControllerMocks.loadChromeAiAvailabilityMock
    .mockResolvedValueOnce('downloadable')
    .mockResolvedValueOnce('available');
  chromeAiControllerMocks.prepareChromeAiSessionMock.mockImplementation(
    async (args: { onDownloadProgress?: (value: number) => void }) => {
      args.onDownloadProgress?.(0.35);
    }
  );
  const args = createArgs();

  await renderHarness(args);
  await flushEffects();
  await act(async () => {
    await latestState?.handleToggle();
  });

  expect(chromeAiControllerMocks.saveChromeAiEnabledMock).toHaveBeenCalledWith(true);
  expect(args.setChromeAiEnabled).toHaveBeenCalledWith(true);
  expect(args.reloadData).toHaveBeenCalledTimes(1);
  expect(chromeAiControllerMocks.toastSuccessMock).toHaveBeenCalledWith(
    translate('settings.aiProviders.chromeAiEnabledMessage')
  );
});

it('surfaces unsupported availability without starting setup', async () => {
  chromeAiControllerMocks.loadChromeAiAvailabilityMock.mockResolvedValue('unsupported');

  await renderHarness(createArgs());
  await flushEffects();
  await act(async () => {
    await latestState?.handleToggle();
  });

  expect(chromeAiControllerMocks.prepareChromeAiSessionMock).not.toHaveBeenCalled();
  expect(latestState?.error).toBe(translate('settings.aiProviders.chromeAiUnsupported'));
});

it('disables chrome-ai and reconciles a chrome default model back to stored providers', async () => {
  const args = createArgs({
    chromeAiEnabled: true,
    defaultModelId: 'chrome-ai-google-model',
  });

  await renderHarness(args);
  await flushEffects();
  await act(async () => {
    await latestState?.handleToggle();
  });

  expect(chromeAiControllerMocks.saveChromeAiEnabledMock).toHaveBeenCalledWith(false);
  expect(args.setChromeAiEnabled).toHaveBeenCalledWith(false);
  expect(chromeAiControllerMocks.saveAiProvidersDefaultModelMock).toHaveBeenCalledWith(
    'remote-model',
    args.setDefaultModelId
  );
  expect(args.reloadData).toHaveBeenCalledTimes(1);
});

it('reports setup failures through error state, logger, and toast', async () => {
  chromeAiControllerMocks.loadChromeAiAvailabilityMock.mockResolvedValue('downloadable');
  chromeAiControllerMocks.prepareChromeAiSessionMock.mockRejectedValue(new Error('setup failed'));

  await renderHarness(createArgs());
  await flushEffects();
  await act(async () => {
    await latestState?.handleToggle();
  });

  expect(chromeAiControllerMocks.toastErrorMock).toHaveBeenCalledWith('setup failed');
  expect(chromeAiControllerMocks.loggerErrorMock).toHaveBeenCalledWith(
    'Failed to enable Chrome AI',
    expect.any(Error)
  );
  expect(latestState?.error).toBe('setup failed');
});

it.each([
  ['unsupported', 'background.runtime.chromeAiUnsupported'],
  ['unexpected', 'background.runtime.chromeAiUnexpectedError'],
] as const)('translates typed chrome-ai %s setup failures', async (reason, messageKey) => {
  chromeAiControllerMocks.loadChromeAiAvailabilityMock.mockResolvedValue('downloadable');
  chromeAiControllerMocks.prepareChromeAiSessionMock.mockRejectedValue(
    new ChromeAiRuntimeError(reason)
  );

  await renderHarness(createArgs());
  await flushEffects();
  await act(async () => {
    await latestState?.handleToggle();
  });

  expect(chromeAiControllerMocks.toastErrorMock).toHaveBeenCalledWith(translate(messageKey));
  expect(latestState?.error).toBe(translate(messageKey));
});
