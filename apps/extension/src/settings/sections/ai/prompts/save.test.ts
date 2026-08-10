import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  saveGlobal: vi.fn(),
  saveScenario: vi.fn(),
  resetGlobal: vi.fn(),
  resetScenario: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../runtime/ai-settings/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/ai-settings/mutations')>()),
  saveGlobalSystemPrompt: mocks.saveGlobal,
  saveScenarioEditorSystemPrompt: mocks.saveScenario,
  resetGlobalSystemPrompt: mocks.resetGlobal,
  resetScenarioEditorSystemPrompt: mocks.resetScenario,
}));
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));
import {
  resetAiProvidersGlobalPrompt,
  resetAiProvidersScenarioEditorPrompt,
  saveAiProvidersGlobalPrompt,
  saveAiProvidersScenarioEditorPrompt,
} from './save';
beforeEach(() => {
  vi.clearAllMocks();
});
it('keeps prompt mutations with the canonical runtime owner', async () => {
  mocks.saveGlobal.mockResolvedValue(undefined);
  mocks.saveScenario.mockResolvedValue(undefined);
  expect(await saveAiProvidersGlobalPrompt('global')).toBeNull();
  expect(await saveAiProvidersScenarioEditorPrompt('scenario')).toBeNull();
  expect(mocks.saveGlobal).toHaveBeenCalledWith('global');
  expect(mocks.saveScenario).toHaveBeenCalledWith('scenario');
});

it('reports a committed reset without a fallible post-commit read', async () => {
  mocks.resetGlobal.mockResolvedValue(undefined);
  mocks.resetScenario.mockResolvedValue(undefined);

  await expect(resetAiProvidersGlobalPrompt()).resolves.toEqual({
    error: null,
  });
  await expect(resetAiProvidersScenarioEditorPrompt()).resolves.toEqual({
    error: null,
  });
  expect(mocks.resetGlobal).toHaveBeenCalledOnce();
  expect(mocks.resetScenario).toHaveBeenCalledOnce();
});

it('reports reset failures without supplying a replacement value', async () => {
  mocks.resetGlobal.mockRejectedValueOnce(new Error('reset failed'));
  await expect(resetAiProvidersGlobalPrompt()).resolves.toEqual({
    error: 'common.states.errorsettings.aiProviders.globalPromptResetErrorSuffix',
  });
});
