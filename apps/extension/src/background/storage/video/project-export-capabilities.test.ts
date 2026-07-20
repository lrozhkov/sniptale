import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageSessionGetMock,
  browserStorageSessionIsAvailableMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  storedSessionValues,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionIsAvailableMock: vi.fn(() => true),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  storedSessionValues: {} as Record<string, unknown>,
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: browserStorageSessionGetMock,
        isAvailable: browserStorageSessionIsAvailableMock,
        remove: browserStorageSessionRemoveMock,
        set: browserStorageSessionSetMock,
      },
    },
  })
);

import { createCapabilityContext } from '@sniptale/platform/security/capability-context';
import {
  readProjectExportCapabilities,
  resetPersistedProjectExportCapabilities,
  writeProjectExportCapabilities,
} from './project-export-capabilities';

const CAPABILITY_STORAGE_KEY = 'video-project-export-capabilities';
const SENDER_URL = 'chrome-extension://extension-id/apps/extension/src/video-editor/index.html';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(storedSessionValues)) {
    delete storedSessionValues[key];
  }
  browserStorageSessionGetMock.mockImplementation(async (keys: string | string[]) => {
    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(requestedKeys.map((key) => [key, storedSessionValues[key]]));
  });
  browserStorageSessionSetMock.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(storedSessionValues, items);
  });
  browserStorageSessionIsAvailableMock.mockReturnValue(true);
  browserStorageSessionRemoveMock.mockResolvedValue(undefined);
});

it('derives CapabilityContext when reading persisted project export capabilities', async () => {
  storedSessionValues[CAPABILITY_STORAGE_KEY] = {
    records: {
      'token-1': {
        documentId: 'doc-1',
        expiresAt: Date.now() + 60_000,
        generation: 'generation-1',
        jobId: 'job-1',
        purpose: 'start-project-export',
        senderUrl: SENDER_URL,
        settingsFingerprint: 'settings-1',
        version: 1,
      },
    },
    version: 1,
  };

  const records = await readProjectExportCapabilities(new Map());
  const record = records.get('token-1');

  expect(record?.capabilityContext).toEqual({
    expiresAtEpochMs: record?.expiresAt,
    origin: 'chrome-extension://extension-id',
    scopes: ['export:video-project:start'],
    tabId: null,
    token: 'token-1',
  });
});

it('persists the shared CapabilityContext with project export capabilities', async () => {
  await writeProjectExportCapabilities(
    new Map(),
    new Map([
      [
        'token-2',
        {
          capabilityContext: createCapabilityContext({
            expiresAtEpochMs: Date.now() + 60_000,
            origin: 'chrome-extension://extension-id',
            scopes: ['export:video-project:cancel'],
            token: 'token-2',
          }),
          documentId: 'doc-1',
          expiresAt: Date.now() + 60_000,
          generation: 'generation-2',
          jobId: 'job-1',
          purpose: 'cancel-project-export',
          senderUrl: SENDER_URL,
        },
      ],
    ])
  );

  const store = storedSessionValues[CAPABILITY_STORAGE_KEY] as {
    records?: Record<string, unknown>;
  };
  expect(store.records?.['token-2']).toEqual(
    expect.objectContaining({
      capabilityContext: expect.objectContaining({
        scopes: ['export:video-project:cancel'],
        token: 'token-2',
      }),
    })
  );
});

it('uses the worker capability cache without durable writes when session storage is unavailable', async () => {
  const cache = new Map([
    [
      'token-1',
      createCapability({
        purpose: 'start-project-export',
        scopes: ['export:video-project:start'],
        token: 'token-1',
      }),
    ],
  ]);
  browserStorageSessionIsAvailableMock.mockReturnValue(false);

  const records = await readProjectExportCapabilities(cache);
  records.set(
    'token-2',
    createCapability({
      purpose: 'cancel-project-export',
      scopes: ['export:video-project:cancel'],
      token: 'token-2',
    })
  );

  await writeProjectExportCapabilities(cache, records);
  resetPersistedProjectExportCapabilities();

  expect(browserStorageSessionGetMock).not.toHaveBeenCalled();
  expect(browserStorageSessionSetMock).not.toHaveBeenCalled();
  expect(browserStorageSessionRemoveMock).not.toHaveBeenCalled();
  expect(cache.has('token-1')).toBe(true);
  expect(cache.has('token-2')).toBe(true);
});

function createCapability(args: {
  purpose: 'cancel-project-export' | 'start-project-export';
  scopes: ['export:video-project:cancel'] | ['export:video-project:start'];
  token: string;
}) {
  return {
    capabilityContext: createCapabilityContext({
      expiresAtEpochMs: Date.now() + 60_000,
      origin: 'chrome-extension://extension-id',
      scopes: args.scopes,
      token: args.token,
    }),
    documentId: 'doc-1',
    expiresAt: Date.now() + 60_000,
    generation: `${args.token}-generation`,
    jobId: 'job-1',
    purpose: args.purpose,
    senderUrl: SENDER_URL,
  };
}
