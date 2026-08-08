import { expect, it, vi } from 'vitest';

const providerSecretMocks = vi.hoisted(() => ({
  handleAiProviderSecretClearMock: vi.fn(),
}));

vi.mock('../provider-secret-actions', () => ({
  handleAiProviderSecretClear: providerSecretMocks.handleAiProviderSecretClearMock,
}));

import { useAiProvidersProviderSecretActions } from './provider-secret-actions';

it('routes provider secret clears through the section reload owner', async () => {
  const reloadData = vi.fn().mockResolvedValue(undefined);
  const handlers = useAiProvidersProviderSecretActions({ reloadData });

  await handlers.handleClearProviderSecret('provider-1');

  expect(providerSecretMocks.handleAiProviderSecretClearMock).toHaveBeenCalledWith({
    providerId: 'provider-1',
    reloadData,
  });
});
