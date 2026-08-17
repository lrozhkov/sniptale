import { describe, expect, it } from 'vitest';
import { isSettingsTransferResponse } from './settings-transfer-response-guard';

describe('settings transfer response guard', () => {
  it('accepts fully shaped nested inspection and report variants', () => {
    expect(
      isSettingsTransferResponse({
        success: true,
        operation: 'read-export-tree',
        tree: treeFixture(),
      })
    ).toBe(true);
    expect(
      isSettingsTransferResponse({
        success: true,
        operation: 'inspect-import',
        inspection: inspectionFixture(),
      })
    ).toBe(true);
    expect(
      isSettingsTransferResponse({
        success: true,
        operation: 'commit-import',
        report: reportFixture(),
      })
    ).toBe(true);
    expect(
      isSettingsTransferResponse({
        success: false,
        operation: 'commit-import',
        errorCode: 'rollback-failed',
        error: 'failed',
      })
    ).toBe(true);
  });

  it.each([
    null,
    { success: 'yes', operation: 'commit-import' },
    { success: true, operation: 'unknown' },
    { success: false, operation: 'commit-import', errorCode: 'unknown', error: 'failed' },
    { success: false, operation: 'commit-import', errorCode: 'commit-failed', error: '' },
    {
      success: false,
      operation: 'commit-import',
      errorCode: 'commit-failed',
      error: 'failed',
      extra: true,
    },
    { success: true, operation: 'read-export-tree', tree: {} },
    { success: true, operation: 'build-export-package', filename: '', fileText: '{}' },
    { success: true, operation: 'build-export-package', filename: 'settings.json', fileText: '{}' },
    { success: true, operation: 'commit-import', report: { ...reportFixture(), status: 'failed' } },
    {
      success: true,
      operation: 'commit-import',
      report: { ...reportFixture(), strategy: 'other' },
    },
    {
      success: true,
      operation: 'commit-import',
      report: { ...reportFixture(), appliedNodeIds: Array.from({ length: 50_001 }, () => 'a') },
    },
  ])('rejects malformed outer response variants', (value) => {
    expect(isSettingsTransferResponse(value)).toBe(false);
  });

  it.each([
    { fingerprint: 'short' },
    { package: {} },
    { tree: {} },
    { conflicts: {} },
    { conflicts: [conflictFixture({ id: '' })] },
    { conflicts: [conflictFixture({ nodeId: '' })] },
    { conflicts: [conflictFixture({ kind: 'other' })] },
    { conflicts: [conflictFixture({ allowedDecisions: [] })] },
    { conflicts: [conflictFixture({ allowedDecisions: ['other'] })] },
    { conflicts: [conflictFixture({ defaultDecision: 'other' })] },
    { conflicts: [conflictFixture({ defaultDecision: 'import-as-copy' })] },
    { summary: { ...summaryFixture(), added: -1 } },
    { summary: { ...summaryFixture(), warnings: [1] } },
    { summary: { ...summaryFixture(), extra: true } },
    { exactRestoreAvailable: 'yes' },
  ])('rejects malformed inspection internals', (patch) => {
    expect(
      isSettingsTransferResponse({
        success: true,
        operation: 'inspect-import',
        inspection: { ...inspectionFixture(), ...patch },
      })
    ).toBe(false);
  });

  it.each([
    { id: '' },
    { parentId: 1 },
    { domainId: '' },
    { labelKey: '' },
    { descriptionKey: '' },
    { kind: 'other' },
    { classification: 'other' },
    { selectable: 'yes' },
    { requiredBy: [1] },
    { children: {} },
    { extra: true },
  ])('rejects malformed tree nodes', (patch) => {
    expect(
      isSettingsTransferResponse({
        success: true,
        operation: 'read-export-tree',
        tree: [{ ...treeNodeFixture(), ...patch }],
      })
    ).toBe(false);
  });

  it('rejects a tree beyond the response depth ceiling', () => {
    let node = treeNodeFixture();
    for (let depth = 0; depth < 35; depth += 1) {
      node = treeNodeFixture({ id: `node-${depth}`, children: [node] });
    }
    expect(
      isSettingsTransferResponse({ success: true, operation: 'read-export-tree', tree: [node] })
    ).toBe(false);
  });
});

function inspectionFixture() {
  return {
    fingerprint: 'a'.repeat(64),
    package: packageFixture(),
    tree: treeFixture(),
    conflicts: [conflictFixture(), conflictFixture({ id: 'item', nodeId: 'item', kind: 'item' })],
    summary: summaryFixture(),
    exactRestoreAvailable: true,
  };
}

function reportFixture() {
  return {
    ...summaryFixture(),
    status: 'committed',
    strategy: 'safe-merge',
    appliedNodeIds: ['capture.image.format'],
  };
}

function summaryFixture() {
  return {
    added: 1,
    updated: 2,
    copiedRemapped: 3,
    unchanged: 4,
    skipped: 5,
    warnings: ['warning'],
    clearedAiSecretBindings: ['provider-a'],
    missingAiSecretBindings: ['provider-b'],
  };
}

function conflictFixture(patch: Record<string, unknown> = {}) {
  return {
    id: 'capture.image.format',
    nodeId: 'capture.image.format',
    kind: 'scalar',
    allowedDecisions: ['keep-local', 'use-imported'],
    defaultDecision: 'use-imported',
    ...patch,
  };
}

function treeFixture() {
  return [
    treeNodeFixture({
      children: [
        treeNodeFixture({
          id: 'child',
          parentId: 'root',
          kind: 'item',
          classification: 'secret',
          children: [],
        }),
      ],
    }),
    treeNodeFixture({ id: 'device', classification: 'device-bound' }),
    treeNodeFixture({ id: 'action', classification: 'action/status' }),
  ];
}

function treeNodeFixture(patch: Record<string, unknown> = {}) {
  return {
    id: 'root',
    parentId: null,
    domainId: 'capture.image',
    labelKey: 'label',
    descriptionKey: 'description',
    kind: 'collection',
    classification: 'transferable',
    selectable: true,
    requiredBy: ['capture.image'],
    children: [],
    ...patch,
  };
}

function packageFixture() {
  return {
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind: 'backup',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains: { 'capture.image': { schemaVersion: 1, data: { format: 'png' } } },
  };
}
