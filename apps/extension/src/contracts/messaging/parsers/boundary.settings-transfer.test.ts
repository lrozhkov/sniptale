import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseBackgroundRuntimeMessage, parseRuntimeResponseForMessage } from './boundary';

it('accepts each settings transfer operation at the background boundary', () => {
  expect(
    parseBackgroundRuntimeMessage({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'read-export-tree',
    })
  ).toMatchObject({ operation: 'read-export-tree' });
  expect(
    parseBackgroundRuntimeMessage({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'build-export-package',
      exportKind: 'selective',
      selectedNodeIds: ['capture.image.format'],
    })
  ).toMatchObject({ operation: 'build-export-package' });
  expect(
    parseBackgroundRuntimeMessage({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'inspect-import',
      fileText: '{}',
    })
  ).toMatchObject({ operation: 'inspect-import' });
  expect(
    parseBackgroundRuntimeMessage({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'commit-import',
      fileText: '{}',
      strategy: 'overwrite-matching',
      selectedNodeIds: ['capture.image'],
      decisions: { conflict: 'use-imported' },
      fingerprint: 'a'.repeat(64),
      destructiveConfirmed: false,
    })
  ).toMatchObject({ operation: 'commit-import' });
});

it('rejects malformed settings transfer commit decisions before dispatch', () => {
  expect(() =>
    parseBackgroundRuntimeMessage({
      type: MessageType.SETTINGS_TRANSFER,
      operation: 'commit-import',
      fileText: '{}',
      strategy: 'safe-merge',
      selectedNodeIds: [],
      decisions: { conflict: 'send-secret' },
      fingerprint: 'a'.repeat(64),
      destructiveConfirmed: false,
    })
  ).toThrow();
});

it.each([
  { success: true, operation: 'read-export-tree', tree: [] },
  {
    success: true,
    operation: 'build-export-package',
    filename: 'settings.json',
    fileText: JSON.stringify(packageFixture()),
  },
  { success: true, operation: 'inspect-import', inspection: inspectionFixture() },
  { success: true, operation: 'commit-import', report: reportFixture() },
  {
    success: false,
    operation: 'commit-import',
    errorCode: 'commit-failed',
    error: 'failed',
  },
])('accepts the bounded settings transfer response contract', (response) => {
  expect(parseRuntimeResponseForMessage(MessageType.SETTINGS_TRANSFER, response)).toEqual(response);
});

it.each([
  null,
  { type: MessageType.SETTINGS_TRANSFER, operation: 'unknown' },
  { type: MessageType.SETTINGS_TRANSFER, operation: 'read-export-tree', extra: true },
  {
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'build-export-package',
    exportKind: 'invalid',
    selectedNodeIds: [],
  },
  {
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'inspect-import',
    fileText: 'x'.repeat(2 * 1024 * 1024 + 1),
  },
  {
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'commit-import',
    fileText: '{}',
    strategy: 'invalid',
    selectedNodeIds: [],
    decisions: {},
    fingerprint: 'short',
    destructiveConfirmed: false,
  },
])('rejects an invalid transfer request variant', (message) => {
  expect(() => parseBackgroundRuntimeMessage(message)).toThrow();
});

it.each([
  null,
  { success: true, operation: 'read-export-tree', tree: 'invalid' },
  { success: true, operation: 'build-export-package', filename: 1, fileText: '{}' },
  { success: true, operation: 'inspect-import', inspection: null },
  { success: true, operation: 'inspect-import', inspection: {} },
  { success: true, operation: 'commit-import', report: null },
  { success: true, operation: 'commit-import', report: {} },
  { success: true, operation: 'unknown' },
  { success: false, operation: 'commit-import', errorCode: 1, error: 'failed' },
  { success: false, operation: 'commit-import', errorCode: 'unknown', error: 'failed' },
])('rejects an invalid transfer response variant', (response) => {
  expect(() => parseRuntimeResponseForMessage(MessageType.SETTINGS_TRANSFER, response)).toThrow();
});

function inspectionFixture() {
  return {
    fingerprint: 'a'.repeat(64),
    package: packageFixture(),
    tree: [],
    conflicts: [],
    summary: summaryFixture(),
    exactRestoreAvailable: false,
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
    added: 0,
    updated: 0,
    copiedRemapped: 0,
    unchanged: 0,
    skipped: 0,
    warnings: [],
    clearedAiSecretBindings: [],
    missingAiSecretBindings: [],
  };
}

function packageFixture() {
  return {
    format: 'sniptale-settings',
    formatVersion: 1,
    exportKind: 'selective',
    exportedAt: '2026-08-16T12:00:00.000Z',
    source: { appVersion: '1.0.0' },
    domains: {
      'capture.image': { schemaVersion: 1, data: { format: 'png' } },
    },
  };
}
