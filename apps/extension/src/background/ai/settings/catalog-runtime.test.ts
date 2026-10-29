import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../contracts/settings';
import type { AICatalogRefreshAdmission } from '../../../composition/persistence/ai-settings/managed-catalog';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  providers: vi.fn(),
  admit: vi.fn(),
  commit: vi.fn(),
  current: vi.fn(),
  secret: vi.fn(),
  permission: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('../../../composition/persistence/ai-settings', () => ({
  initializeAiStorageAccess: mocks.initialize,
  loadAIProviders: mocks.providers,
}));
vi.mock('../../../composition/persistence/ai-settings/graph-mutations', () => ({
  admitStoredAICatalogRefresh: mocks.admit,
  commitStoredAICatalogRefresh: mocks.commit,
}));
vi.mock('../../../composition/persistence/ai-settings/managed-catalog', () => ({
  readAdmittedCatalogProvider: mocks.current,
}));
vi.mock('../../../composition/persistence/ai-settings/provider-secrets.store', () => ({
  readStoredAIProviderSecretStateForProvider: mocks.secret,
}));

import { refreshManagedProviderCatalogs, refreshProviderCatalog } from './catalog-runtime';

const provider: AIProvider = {
  id: 'provider',
  name: 'neuraldeep.ru',
  connectionType: 'neuraldeep',
  baseUrl: 'https://api.neuraldeep.ru/v1',
  hasStoredApiKey: true,
  createdAt: 1,
  incarnation: 'incarnation',
  management: 'automatic',
  enabled: true,
  revision: 1,
  credentialRevision: 1,
};
const admission: AICatalogRefreshAdmission = {
  provider,
  token: {
    providerId: provider.id,
    incarnation: 'incarnation',
    revision: 1,
    credentialRevision: 1,
    generation: 'generation',
    scope: 'scope',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initialize.mockResolvedValue(undefined);
  mocks.providers.mockResolvedValue([provider]);
  mocks.admit.mockResolvedValue(admission);
  mocks.current.mockResolvedValue(provider);
  mocks.commit.mockResolvedValue(true);
  mocks.secret.mockResolvedValue({ status: 'ok', secret: 'fixture-secret' });
  mocks.permission.mockResolvedValue(true);
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ data: [{ id: 'exact-id', type: 'chat' }] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('chrome', { permissions: { contains: mocks.permission } });
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

it('uses the configured credential only after admission and repeats checks before the request', async () => {
  await refreshProviderCatalog(provider.id);
  expect(mocks.admit).toHaveBeenCalledWith(provider.id, true);
  expect(mocks.current).toHaveBeenCalledTimes(2);
  expect(mocks.permission).toHaveBeenCalledWith({ origins: ['https://api.neuraldeep.ru/*'] });
  expect(mocks.secret).toHaveBeenCalledTimes(2);
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.commit).toHaveBeenCalledWith(
    admission.token,
    expect.objectContaining({
      kind: 'catalog',
      complete: true,
      models: [expect.objectContaining({ modelCode: 'exact-id' })],
    })
  );
});

it('records missing host permission without reading a secret or requesting a grant', async () => {
  mocks.permission.mockResolvedValue(false);
  await refreshProviderCatalog(provider.id);
  expect(mocks.secret).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.commit).toHaveBeenCalledWith(admission.token, {
    kind: 'failure',
    reason: 'host-permission-required',
    status: 'permission-required',
  });
});

it('records a locked secret without unlocking it or sending a request', async () => {
  mocks.secret.mockResolvedValue({ status: 'locked' });
  await refreshProviderCatalog(provider.id);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.commit).toHaveBeenCalledWith(admission.token, {
    kind: 'failure',
    reason: 'secret-locked',
    status: 'locked',
  });
});

it('refuses a provider that changes between secret preparation and dispatch', async () => {
  mocks.current.mockResolvedValueOnce(provider).mockResolvedValueOnce(null);
  await refreshProviderCatalog(provider.id);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.commit).toHaveBeenCalledWith(admission.token, {
    kind: 'failure',
    reason: 'provider-unavailable',
  });
});

it('keeps provider account denial distinct from a missing Chrome host grant', async () => {
  mocks.fetch.mockResolvedValue(new Response('{}', { status: 403 }));
  await refreshProviderCatalog(provider.id);
  expect(mocks.commit).toHaveBeenCalledWith(admission.token, {
    kind: 'failure',
    reason: 'permission-denied',
  });
});

it('does not query manual or disabled connections during automatic maintenance', async () => {
  mocks.providers.mockResolvedValue([
    { ...provider, management: 'manual' },
    { ...provider, id: 'disabled', enabled: false },
  ]);
  await refreshManagedProviderCatalogs();
  expect(mocks.admit).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('uses local Ollama without a credential while retaining host permission checks', async () => {
  const local = {
    ...provider,
    connectionType: 'ollama' as const,
    baseUrl: 'http://localhost:11434/api',
    hasStoredApiKey: false,
  };
  mocks.current.mockResolvedValue(local);
  mocks.admit.mockResolvedValue({ ...admission, provider: local });
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ models: [] })));
  await refreshProviderCatalog(provider.id);
  expect(mocks.permission).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });
  expect(mocks.secret).not.toHaveBeenCalled();
  expect(new Headers(mocks.fetch.mock.calls[0]?.[1].headers).has('Authorization')).toBe(false);
});

it('does not invent a billable probe when the provider has no admitted catalog endpoint', async () => {
  const audioOnly = { ...provider, connectionType: 'deepgram' as const };
  mocks.current.mockResolvedValue(audioOnly);
  mocks.admit.mockResolvedValue({ ...admission, provider: audioOnly });
  await refreshProviderCatalog(provider.id);
  expect(mocks.secret).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.commit).toHaveBeenCalledWith(admission.token, {
    kind: 'failure',
    reason: 'catalog-unsupported',
    status: 'unverified',
  });
});
