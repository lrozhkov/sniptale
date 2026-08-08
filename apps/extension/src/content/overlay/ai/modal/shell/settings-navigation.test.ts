// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

const { sendRuntimeMessage, showToast } = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
  showToast: vi.fn(),
}));
const contentIntent = { requestId: 'request-1', token: 'token-1' };

vi.mock('../../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../application/privileged-action-intent')>()),
  createTrustedContentActionIntentSource: vi.fn(() => ({ kind: 'trusted-content-event' })),
  attachContentActionIntent: vi.fn(async (message) => ({ ...message, contentIntent })),
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast }));

vi.mock('../../../../platform/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-services/services')>()),
  getContentRuntimeServices: () => ({ messaging: { sendRuntimeMessage } }),
}));

import { openAIModalSettings } from './settings-navigation';

afterEach(() => {
  vi.restoreAllMocks();
});

it('surfaces navigation failure without leaving an unhandled rejection', async () => {
  sendRuntimeMessage.mockResolvedValue({ error: 'blocked', success: false });
  await expect(
    openAIModalSettings({ section: 'ai-connections' }, new Event('click'))
  ).resolves.toBeUndefined();
  expect(showToast).toHaveBeenCalledWith('Не удалось открыть настройки AI', 'error');
});

it('delegates the requested settings route to the background navigation owner', async () => {
  sendRuntimeMessage.mockResolvedValue({ result: 'accepted', success: true });

  await openAIModalSettings({ section: 'ai-prompts' }, new Event('click'));

  expect(sendRuntimeMessage).toHaveBeenCalledWith({
    section: 'ai-prompts',
    contentIntent,
    type: 'AI_SETTINGS_NAVIGATION',
  });
});
