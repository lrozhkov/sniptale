vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: vi.fn(async () => undefined),
}));
import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  cloneSettingsTransferJsonValue,
  stringifySettingsTransferPackage,
} from '../../../contracts/settings-transfer';
import { createSurfaceStylePresetCatalog } from '../../../composition/persistence/surface-style-presets/catalog';
import { createSystemViewportPresetCatalog } from '../../../features/viewport-presets/catalog';
import { serializeSurfaceStylePresetCatalog } from '../../../composition/persistence/surface-style-presets/parser';
import { createDefaultGradientPresetCatalog } from '../../../composition/persistence/gradient-presets/defaults';

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
  expect(packageResult.filename).toMatch(/^Sniptale_settings-selective_\d{4}-\d{2}-\d{2}/u);
  expect(JSON.parse(packageResult.fileText)).toMatchObject({
    format: 'sniptale-settings',
    exportKind: 'selective',
  });
});

it('imports one selected viewport preset while preserving destination-only presets', async () => {
  const userPreset = (id: string, order: number) => ({
    kind: 'user' as const,
    id,
    name: id,
    target: 'window' as const,
    width: 1280,
    height: 720,
    enabled: true,
    order,
  });
  const systemPresets = createSystemViewportPresetCatalog();
  mocks.read.mockResolvedValue({
    domains: {
      'capture.viewport-presets': {
        schemaVersion: 1,
        data: cloneSettingsTransferJsonValue({
          items: [...systemPresets, userPreset('local-only', systemPresets.length)],
          defaultId: null,
        }),
      },
    },
    dynamicItems: [],
    dependencies: {},
    locale: 'en',
  });
  const fileText = stringifySettingsTransferPackage({
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind: 'selective',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains: {
      'capture.viewport-presets': {
        schemaVersion: 1,
        data: cloneSettingsTransferJsonValue({
          items: [userPreset('imported', systemPresets.length)],
        }),
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
    selectedNodeIds: ['capture.viewport-presets.items.imported'],
    decisions: {},
    fingerprint: inspected.inspection.fingerprint,
    destructiveConfirmed: false,
  });
  const applied = mocks.apply.mock.calls[0]?.[0].domains['capture.viewport-presets'].data;
  expect(applied.items.map((item: { id: string }) => item.id)).toEqual(
    expect.arrayContaining(['local-only', 'imported'])
  );
});

it('re-exports a copied viewport with its remapped context-menu command', async () => {
  const preset = (name: string, width: number) => ({
    kind: 'user' as const,
    id: 'custom-size',
    name,
    target: 'window' as const,
    width,
    height: 720,
    enabled: true,
    order: createSystemViewportPresetCatalog().length,
  });
  const contextMenu = {
    enabled: true,
    layout: {
      version: 2,
      nodes: [
        { type: 'command', command: 'sniptale.window-resize.preset.custom-size', enabled: true },
      ],
    },
  };
  const current = {
    domains: {
      'capture.viewport-presets': {
        schemaVersion: 1 as const,
        data: cloneSettingsTransferJsonValue({
          items: [...createSystemViewportPresetCatalog(), preset('Local', 1280)],
          defaultId: null,
        }),
      },
      'interface.preferences': {
        schemaVersion: 1 as const,
        data: cloneSettingsTransferJsonValue({ contextMenu }),
      },
    },
    dynamicItems: [],
    dependencies: {},
    locale: 'en' as const,
  };
  mocks.read.mockImplementation(async () => current);
  mocks.apply.mockImplementation(async ({ domains }: { domains: typeof current.domains }) => {
    Object.assign(current.domains, domains);
  });
  const fileText = stringifySettingsTransferPackage({
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind: 'selective',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains: {
      'capture.viewport-presets': { schemaVersion: 1, data: { items: [preset('Imported', 1440)] } },
      'interface.preferences': { schemaVersion: 1, data: { contextMenu } },
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
  const exported = await executeSettingsTransferOperation({
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'build-export-package',
    exportKind: 'backup',
    selectedNodeIds: [],
  });
  if (!('fileText' in exported)) throw new Error('Expected re-exported package');
  const reexported = JSON.parse(exported.fileText).domains;
  expect(reexported['capture.viewport-presets'].data.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'custom-size-imported', width: 1440 })])
  );
  expect(reexported['interface.preferences'].data.contextMenu.layout.nodes[0].command).toBe(
    'sniptale.window-resize.preset.custom-size-imported'
  );
});

it.each([
  [
    'styles.gradients',
    createDefaultGradientPresetCatalog(),
    { defaultPresetIdBySurface: { 'highlighter-frame-fill': 'missing' } },
  ],
  [
    'styles.gradients',
    createDefaultGradientPresetCatalog(),
    { favoriteIdsBySurface: { 'highlighter-frame-fill': ['missing'] } },
  ],
  ['styles.gradients', createDefaultGradientPresetCatalog(), { revision: 999 }],
  [
    'styles.surfaces',
    serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog()),
    { defaultPresetId: 'missing' },
  ],
  [
    'styles.surfaces',
    serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog()),
    { favoriteIds: ['missing'] },
  ],
])(
  'rejects an invalid merged %s catalog before any write',
  async (domainId, currentData, importedData) => {
    mocks.read.mockResolvedValue({
      domains: {
        [domainId]: { schemaVersion: 1, data: cloneSettingsTransferJsonValue(currentData) },
      },
      dynamicItems: [],
      dependencies: {},
      locale: 'en',
    });
    const fileText = stringifySettingsTransferPackage({
      format: 'sniptale-settings',
      formatVersion: 1,
      exportKind: 'selective',
      exportedAt: '2026-08-16T12:00:00.000Z',
      source: { appVersion: '1.0.0' },
      domains: {
        [domainId]: { schemaVersion: 1, data: cloneSettingsTransferJsonValue(importedData) },
      },
    });
    await expect(
      executeSettingsTransferOperation({
        type: MessageType.SETTINGS_TRANSFER,
        operation: 'inspect-import',
        fileText,
      })
    ).rejects.toThrow();
    const safePackage = JSON.parse(fileText);
    safePackage.domains[domainId].data = {};
    const inspected = await executeSettingsTransferOperation({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'inspect-import',
      fileText: JSON.stringify(safePackage),
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
    ).rejects.toThrow();
    expect(mocks.apply).not.toHaveBeenCalled();
  }
);

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
  expect(mocks.read).toHaveBeenLastCalledWith(expect.any(Object));
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

it.each([
  ['unknown domain', 1, { 'future.feature': { schemaVersion: 1, data: {} } }],
  ['damaged known domain', 1, { 'capture.image': { schemaVersion: 1, data: { format: 'bad' } } }],
  ['future domain schema', 1, { 'capture.image': { schemaVersion: 2, data: { format: 'png' } } }],
  ['future package format', 2, { 'capture.image': { schemaVersion: 1, data: { format: 'png' } } }],
])('rejects %s during inspection before any write', async (_label, formatVersion, domains) => {
  mocks.read.mockResolvedValue(snapshot('png', 100));
  const fileText = JSON.stringify({
    format: 'sniptale-settings',
    formatVersion,
    exportKind: 'selective',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains,
  });
  await expect(
    executeSettingsTransferOperation({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'inspect-import',
      fileText,
    })
  ).rejects.toThrow();
  expect(mocks.apply).not.toHaveBeenCalled();
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
