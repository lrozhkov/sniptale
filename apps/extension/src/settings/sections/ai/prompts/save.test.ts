import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  saveGlobal: vi.fn(),
  saveScenario: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../../runtime/ai-settings/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/ai-settings/mutations')>()),
  saveGlobalSystemPrompt: mocks.saveGlobal,
  saveScenarioEditorSystemPrompt: mocks.saveScenario,
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
import { saveAiProvidersGlobalPrompt, saveAiProvidersScenarioEditorPrompt } from './save';
it('keeps prompt mutations with the canonical runtime owner', async () => {
  mocks.saveGlobal.mockResolvedValue(undefined);
  mocks.saveScenario.mockResolvedValue(undefined);
  expect(await saveAiProvidersGlobalPrompt('global')).toBeNull();
  expect(await saveAiProvidersScenarioEditorPrompt('scenario')).toBeNull();
  expect(mocks.saveGlobal).toHaveBeenCalledWith('global');
  expect(mocks.saveScenario).toHaveBeenCalledWith('scenario');
});
