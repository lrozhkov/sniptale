import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  cloneSettingsTransferJsonValue,
  stringifySettingsTransferPackage,
} from '../../../contracts/settings-transfer';
import { createSurfaceStylePresetCatalog } from '../../../composition/persistence/surface-style-presets/catalog';
import { serializeSurfaceStylePresetCatalog } from '../../../composition/persistence/surface-style-presets/parser';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  completeBackup: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../../../workflows/settings-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/settings-transfer')>()),
  isCompleteSettingsTransferBackup: mocks.completeBackup,
}));

vi.mock('../../../composition/persistence/settings-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings-transfer')>()),
  applySettingsTransferDomains: mocks.apply,
  readSettingsTransferSnapshot: mocks.read,
}));

vi.mock(
  '../../../composition/persistence/infrastructure/mutation-barrier',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/mutation-barrier')
    >()),
    runWithExclusivePersistenceMutationPermit: (operation: (permit: object) => unknown) =>
      operation({}),
  })
);

import { executeSettingsTransferOperation, SettingsTransferStalePlanError } from './use-case';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apply.mockResolvedValue(undefined);
  mocks.completeBackup.mockReturnValue(true);
});

it('reads the export tree and builds a readable selective package', async () => {
  mocks.read.mockResolvedValue(snapshot('png', 100));
  const treeResult = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'read-export-tree',
  });
  expect(treeResult).toHaveProperty('tree');

  const packageResult = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'build-export-package',
    exportKind: 'selective',
    selectedNodeIds: ['capture.image.format'],
  });
  if (!('fileText' in packageResult)) throw new Error('Expected built package');
  expect(packageResult.filename).toMatch(/^sniptale-settings-selective-\d{4}-\d{2}-\d{2}/u);
  expect(JSON.parse(packageResult.fileText)).toMatchObject({
    format: 'sniptale-settings',
    exportKind: 'selective',
  });
});

it('inspects a backup and commits the reviewed selection', async () => {
  mocks.read.mockResolvedValue(snapshot('png', 100));
  const fileText = packageText('backup', 'webp', 80);
  const inspected = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'inspect-import',
    fileText,
  });
  if (!('inspection' in inspected)) throw new Error('Expected import inspection');
  expect(inspected.inspection.exactRestoreAvailable).toBe(true);

  const committed = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'commit-import',
    fileText,
    strategy: 'safe-merge',
    selectedNodeIds: ['capture.image.format'],
    decisions: {},
    fingerprint: inspected.inspection.fingerprint,
    destructiveConfirmed: false,
  });
  expect(committed).toMatchObject({
    report: { status: 'committed', strategy: 'safe-merge' },
  });
  expect(mocks.apply).toHaveBeenCalledWith(
    expect.objectContaining({
      domains: { 'capture.image': expect.any(Object) },
      permit: {},
    })
  );
});

it('commits a complete surface catalog after inspect and commit revalidation', async () => {
  const stored = serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog());
  const domains = {
    'styles.surfaces': {
      schemaVersion: 1 as const,
      data: cloneSettingsTransferJsonValue(stored),
    },
  };
  mocks.read.mockResolvedValue({
    domains,
    dynamicItems: [],
    dependencies: {},
    locale: 'ru',
  });
  const fileText = stringifySettingsTransferPackage({
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind: 'selective',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains,
  });
  const inspected = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'inspect-import',
    fileText,
  });
  if (!('inspection' in inspected)) throw new Error('Expected import inspection');

  await expect(
    executeSettingsTransferOperation({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'commit-import',
      fileText,
      strategy: 'safe-merge',
      selectedNodeIds: [],
      decisions: {},
      fingerprint: inspected.inspection.fingerprint,
      destructiveConfirmed: false,
    })
  ).resolves.toMatchObject({ report: { status: 'committed' } });
  expect(mocks.apply).toHaveBeenCalledWith(
    expect.objectContaining({
      domains: {
        'styles.surfaces': {
          schemaVersion: 1,
          data: expect.objectContaining({
            defaultPresetId: expect.any(String),
            presets: expect.any(Array),
          }),
        },
      },
    })
  );
});

it('exact restore applies only the reviewed field selection', async () => {
  mocks.read.mockResolvedValue(snapshot('png', 100));
  const fileText = packageText('backup', 'webp', 80);
  const inspected = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'inspect-import',
    fileText,
  });
  if (!('inspection' in inspected)) throw new Error('Expected import inspection');
  await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'commit-import',
    fileText,
    strategy: 'exact-restore',
    selectedNodeIds: ['capture.image.format'],
    decisions: {},
    fingerprint: inspected.inspection.fingerprint,
    destructiveConfirmed: true,
  });
  expect(mocks.apply).toHaveBeenCalledWith(
    expect.objectContaining({
      domains: {
        'capture.image': { schemaVersion: 1, data: { format: 'webp', quality: 100 } },
      },
    })
  );
});

it('rejects a commit when authoritative settings changed after inspection', async () => {
  mocks.read
    .mockResolvedValueOnce(snapshot('png', 100))
    .mockResolvedValueOnce(snapshot('webp', 70));
  const fileText = packageText('selective', 'jpeg', 85);
  const inspected = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'inspect-import',
    fileText,
  });
  if (!('inspection' in inspected)) throw new Error('Expected import inspection');

  await expect(
    executeSettingsTransferOperation({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'commit-import',
      fileText,
      strategy: 'safe-merge',
      selectedNodeIds: [],
      decisions: {},
      fingerprint: inspected.inspection.fingerprint,
      destructiveConfirmed: false,
    })
  ).rejects.toBeInstanceOf(SettingsTransferStalePlanError);
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('requires destructive confirmation before exact restore enters the transaction', async () => {
  await expect(
    executeSettingsTransferOperation({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'commit-import',
      fileText: packageText('backup', 'webp', 80),
      strategy: 'exact-restore',
      selectedNodeIds: [],
      decisions: {},
      fingerprint: 'a'.repeat(64),
      destructiveConfirmed: false,
    })
  ).rejects.toThrow('destructive confirmation');
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('rejects exact restore for a selective package even when confirmed', async () => {
  await expect(
    executeSettingsTransferOperation({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'commit-import',
      fileText: packageText('selective', 'webp', 80),
      strategy: 'exact-restore',
      selectedNodeIds: [],
      decisions: {},
      fingerprint: 'a'.repeat(64),
      destructiveConfirmed: true,
    })
  ).rejects.toThrow('complete backup');
});

it('does not trust a backup label when the canonical transfer surface is incomplete', async () => {
  mocks.read.mockResolvedValue(snapshot('png', 100));
  mocks.completeBackup.mockReturnValue(false);
  const fileText = packageText('backup', 'webp', 80);
  const inspected = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'inspect-import',
    fileText,
  });
  if (!('inspection' in inspected)) throw new Error('Expected import inspection');
  expect(inspected.inspection.exactRestoreAvailable).toBe(false);

  await expect(
    executeSettingsTransferOperation({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'commit-import',
      fileText,
      strategy: 'exact-restore',
      selectedNodeIds: [],
      decisions: {},
      fingerprint: inspected.inspection.fingerprint,
      destructiveConfirmed: true,
    })
  ).rejects.toThrow('complete backup');
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('safe-merges a conflicting AI model as a strict owner-valid copy', async () => {
  const provider = {
    id: 'provider-a',
    name: 'Provider',
    connectionType: 'openai-compatible' as const,
    baseUrl: 'https://example.com',
    createdAt: 1,
  };
  mocks.read.mockResolvedValue({
    domains: {
      'ai.providers': { schemaVersion: 1, data: { items: [provider] } },
      'ai.models': {
        schemaVersion: 1,
        data: {
          items: [
            {
              id: 'model-a',
              providerId: 'provider-a',
              modelCode: 'local',
              displayName: 'Local',
            },
          ],
          defaultModelId: null,
        },
      },
    },
    dynamicItems: [],
    dependencies: {},
  });
  const fileText = stringifySettingsTransferPackage({
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind: 'selective',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains: {
      'ai.providers': { schemaVersion: 1, data: { items: [provider] } },
      'ai.models': {
        schemaVersion: 1,
        data: {
          items: [
            {
              id: 'model-a',
              providerId: 'provider-a',
              modelCode: 'imported',
              displayName: 'Imported',
            },
          ],
          defaultModelId: null,
        },
      },
    },
  });
  const inspected = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'inspect-import',
    fileText,
  });
  if (!('inspection' in inspected)) throw new Error('Expected import inspection');
  await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'commit-import',
    fileText,
    strategy: 'safe-merge',
    selectedNodeIds: [],
    decisions: {},
    fingerprint: inspected.inspection.fingerprint,
    destructiveConfirmed: false,
  });

  expect(mocks.apply).toHaveBeenCalledWith(
    expect.objectContaining({
      domains: expect.objectContaining({
        'ai.models': {
          schemaVersion: 1,
          data: {
            items: [
              expect.objectContaining({ id: 'model-a', modelCode: 'local' }),
              expect.objectContaining({ id: 'model-a-imported', modelCode: 'imported' }),
            ],
            defaultModelId: null,
          },
        },
      }),
    })
  );
  expect(JSON.stringify(mocks.apply.mock.calls.at(-1))).not.toContain('customized');
});

function snapshot(format: 'jpeg' | 'png' | 'webp', quality: number) {
  return {
    domains: {
      'capture.image': { schemaVersion: 1, data: { format, quality } },
    },
    dynamicItems: [],
    dependencies: {},
    locale: 'en' as const,
  };
}

function packageText(
  exportKind: 'backup' | 'selective',
  format: 'jpeg' | 'png' | 'webp',
  quality: number
) {
  return stringifySettingsTransferPackage({
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind,
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains: {
      'capture.image': { schemaVersion: 1, data: { format, quality } },
    },
  });
}
