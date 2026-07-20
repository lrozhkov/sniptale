import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageSessionGetMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  storedSessionValues,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  storedSessionValues: {} as Record<string, unknown>,
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: browserStorageSessionGetMock,
        isAvailable: () => true,
        remove: browserStorageSessionRemoveMock,
        set: browserStorageSessionSetMock,
      },
    },
  })
);
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types';
import {
  clearProjectExportRuntimeCapabilityCacheForTests,
  consumeProjectExportCancelCapability,
  consumeProjectExportStartCapability,
  issueProjectExportCancelCapability,
  issueProjectExportStartCapability,
  resetProjectExportRuntimeCapabilitiesForTests,
} from './export-capabilities';

const CAPABILITY_STORAGE_KEY = 'video-project-export-capabilities';
const DOCUMENT_ID = 'editor-doc-1';
const JOB_ID = 'job-1';
const SENDER_URL = 'chrome-extension://test/apps/extension/src/video-editor/index.html';

function createExportSettings(
  overrides: Partial<VideoProjectExportSettings> = {}
): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
    ...overrides,
  };
}

function createStartCapabilityBinding(
  overrides: {
    documentId?: string;
    jobId?: string;
    senderUrl?: string;
    settings?: VideoProjectExportSettings;
    token?: string;
  } = {}
) {
  return {
    documentId: overrides.documentId ?? DOCUMENT_ID,
    jobId: overrides.jobId ?? JOB_ID,
    senderUrl: overrides.senderUrl ?? SENDER_URL,
    settings: overrides.settings ?? createExportSettings(),
    token: overrides.token ?? 'unused-token',
  };
}

function createCancelCapabilityBinding(token: string) {
  return { documentId: DOCUMENT_ID, jobId: JOB_ID, senderUrl: SENDER_URL, token };
}

function readStoredCapabilityRecordCount(): number {
  const store = storedSessionValues[CAPABILITY_STORAGE_KEY] as
    | { records?: Record<string, unknown> }
    | undefined;
  return Object.keys(store?.records ?? {}).length;
}

beforeEach(() => {
  vi.useRealTimers();
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
  browserStorageSessionRemoveMock.mockImplementation(async (keys: string | string[]) => {
    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    for (const key of requestedKeys) {
      delete storedSessionValues[key];
    }
  });
  resetProjectExportRuntimeCapabilitiesForTests();
});

it('persists start capabilities across runtime cache resets and consumes them once', async () => {
  const token = await issueProjectExportStartCapability(createStartCapabilityBinding());

  clearProjectExportRuntimeCapabilityCacheForTests();

  await expect(
    consumeProjectExportStartCapability(createStartCapabilityBinding({ token }))
  ).resolves.toBe(true);
  await expect(
    consumeProjectExportStartCapability(createStartCapabilityBinding({ token }))
  ).resolves.toBe(false);
});

it('rejects wrong purpose bindings as one-shot attempts', async () => {
  const cancelToken = await issueProjectExportCancelCapability({
    documentId: DOCUMENT_ID,
    jobId: JOB_ID,
    senderUrl: SENDER_URL,
  });

  await expect(
    consumeProjectExportStartCapability(createStartCapabilityBinding({ token: cancelToken }))
  ).resolves.toBe(false);
  await expect(
    consumeProjectExportCancelCapability(createCancelCapabilityBinding(cancelToken))
  ).resolves.toBe(false);
});

it('rejects wrong document bindings as one-shot attempts', async () => {
  const startToken = await issueProjectExportStartCapability(createStartCapabilityBinding());
  await expect(
    consumeProjectExportStartCapability(
      createStartCapabilityBinding({
        documentId: 'other-doc',
        token: startToken,
      })
    )
  ).resolves.toBe(false);
});

it('rejects wrong job bindings as one-shot attempts', async () => {
  const wrongJobToken = await issueProjectExportStartCapability(createStartCapabilityBinding());
  await expect(
    consumeProjectExportStartCapability(
      createStartCapabilityBinding({
        jobId: 'other-job',
        token: wrongJobToken,
      })
    )
  ).resolves.toBe(false);
});

it('rejects wrong sender bindings as one-shot attempts', async () => {
  const wrongSenderToken = await issueProjectExportStartCapability(createStartCapabilityBinding());
  await expect(
    consumeProjectExportStartCapability(
      createStartCapabilityBinding({
        senderUrl: 'chrome-extension://test/apps/extension/src/settings/index.html',
        token: wrongSenderToken,
      })
    )
  ).resolves.toBe(false);
});

it('rejects start tokens consumed with different export settings', async () => {
  const token = await issueProjectExportStartCapability(createStartCapabilityBinding());

  await expect(
    consumeProjectExportStartCapability(
      createStartCapabilityBinding({
        settings: createExportSettings({ width: 1920 }),
        token,
      })
    )
  ).resolves.toBe(false);
});

it('prunes expired persisted capabilities before consuming', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const token = await issueProjectExportStartCapability(createStartCapabilityBinding());
  expect(readStoredCapabilityRecordCount()).toBe(1);

  clearProjectExportRuntimeCapabilityCacheForTests();
  vi.setSystemTime(1_000 + 5 * 60 * 1000 + 1);

  await expect(
    consumeProjectExportStartCapability(createStartCapabilityBinding({ token }))
  ).resolves.toBe(false);
  expect(readStoredCapabilityRecordCount()).toBe(0);
});

it('replaces older capabilities for the same owner, job, and purpose', async () => {
  const firstToken = await issueProjectExportStartCapability(createStartCapabilityBinding());
  const secondToken = await issueProjectExportStartCapability(
    createStartCapabilityBinding({
      settings: createExportSettings({ width: 1920 }),
    })
  );

  expect(readStoredCapabilityRecordCount()).toBe(1);
  await expect(
    consumeProjectExportStartCapability(createStartCapabilityBinding({ token: firstToken }))
  ).resolves.toBe(false);
  await expect(
    consumeProjectExportStartCapability(
      createStartCapabilityBinding({
        settings: createExportSettings({ width: 1920 }),
        token: secondToken,
      })
    )
  ).resolves.toBe(true);
});

it('keeps consumed tokens denied when session persistence fails during invalidation', async () => {
  const token = await issueProjectExportStartCapability(createStartCapabilityBinding());

  browserStorageSessionSetMock.mockRejectedValueOnce(new Error('session write failed'));

  await expect(
    consumeProjectExportStartCapability(createStartCapabilityBinding({ token }))
  ).rejects.toThrow('session write failed');
  await expect(
    consumeProjectExportStartCapability(createStartCapabilityBinding({ token }))
  ).resolves.toBe(false);
});

it('fails clearly when token generation is unavailable', async () => {
  vi.stubGlobal('crypto', {});

  await expect(issueProjectExportStartCapability(createStartCapabilityBinding())).rejects.toThrow(
    'Project export capability token generation is unavailable.'
  );
});
