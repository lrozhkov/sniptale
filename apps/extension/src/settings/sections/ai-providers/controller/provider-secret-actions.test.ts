import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';

const { clearAIProviderSecretMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  clearAIProviderSecretMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  clearAIProviderSecret: clearAIProviderSecretMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

describe('provider-secret-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    clearAIProviderSecretMock.mockResolvedValue(undefined);
  });

  it('clears a provider secret, reloads provider data, and shows success', async () => {
    const { handleAiProviderSecretClear } = await import('./provider-secret-actions');
    const reloadData = vi.fn().mockResolvedValue(undefined);

    await handleAiProviderSecretClear({ providerId: 'provider-1', reloadData });

    expect(clearAIProviderSecretMock).toHaveBeenCalledWith('provider-1');
    expect(reloadData).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      translate('settings.aiProviders.providerSecretCleared')
    );
  });

  it('surfaces clear failures without reloading provider data', async () => {
    const { handleAiProviderSecretClear } = await import('./provider-secret-actions');
    const reloadData = vi.fn().mockResolvedValue(undefined);
    clearAIProviderSecretMock.mockRejectedValue(new Error('clear failed'));

    await handleAiProviderSecretClear({ providerId: 'provider-1', reloadData });

    expect(reloadData).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      `${translate('common.states.error')}${translate('settings.aiProviders.providerSecretClearErrorSuffix')}`
    );
    expect(console.error).toHaveBeenCalledWith(
      '[SettingsAiProviders]',
      'Clear provider secret failed',
      expect.any(Error)
    );
  });
});
