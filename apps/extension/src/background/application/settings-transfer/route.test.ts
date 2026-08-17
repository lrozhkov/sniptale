import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { SettingsTransferPackageError } from '../../../contracts/settings-transfer';
import {
  SettingsTransferQuotaError,
  SettingsTransferRollbackError,
} from '../../../composition/persistence/settings-transfer';
import {
  SettingsTransferDomainError,
  SettingsTransferMissingDependencyError,
} from '../../../workflows/settings-transfer';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('./use-case', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./use-case')>()),
  executeSettingsTransferOperation: mocks.execute,
}));

import { routeSettingsTransferMessage } from './route';
import { SettingsTransferStalePlanError } from './use-case';

beforeEach(() => vi.clearAllMocks());

it.each([null, [], 'message', {}, { type: 'unowned' }])(
  'rejects an unowned message without dispatch: %j',
  (message) => {
    const respond = vi.fn();
    expect(routeSettingsTransferMessage(message, respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  }
);

it('returns the operation result through the owned async route', async () => {
  mocks.execute.mockResolvedValue({ tree: [] });
  const respond = vi.fn();
  expect(routeSettingsTransferMessage(message(), respond)).toBe(true);
  await vi.waitFor(() =>
    expect(respond).toHaveBeenCalledWith({
      success: true,
      operation: 'read-export-tree',
      tree: [],
    })
  );
});

it.each([
  [new SettingsTransferStalePlanError(), 'stale-plan'],
  [new SettingsTransferRollbackError(), 'rollback-failed'],
  [new SettingsTransferQuotaError(), 'quota-exceeded'],
  [new SettingsTransferDomainError('future.domain', 'unsupported'), 'unsupported-domain'],
  [new SettingsTransferPackageError('future-format', 'future'), 'future-format'],
  [new SettingsTransferPackageError('invalid-json', 'invalid'), 'invalid-package'],
  [new SettingsTransferMissingDependencyError('missing'), 'invalid-package'],
  [new Error('unexpected'), 'commit-failed'],
])('maps a transfer failure to the public error code: %s', async (failure, errorCode) => {
  mocks.execute.mockRejectedValue(failure);
  const respond = vi.fn();
  routeSettingsTransferMessage(message(), respond);
  await vi.waitFor(() =>
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ errorCode }))
  );
});

function message() {
  return {
    type: MessageType.SETTINGS_TRANSFER,
    operation: 'read-export-tree' as const,
  };
}
