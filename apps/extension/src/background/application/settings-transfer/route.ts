import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  SettingsTransferMessage,
  SettingsTransferResponse,
} from '../../../contracts/settings-transfer';
import { SettingsTransferPackageError } from '../../../contracts/settings-transfer';
import {
  SettingsTransferQuotaError,
  SettingsTransferRollbackError,
} from '../../../composition/persistence/settings-transfer';
import {
  SettingsTransferDomainError,
  SettingsTransferMissingDependencyError,
} from '../../../workflows/settings-transfer';
import { executeSettingsTransferOperation, SettingsTransferStalePlanError } from './use-case';

export function routeSettingsTransferMessage(
  message: unknown,
  sendResponse: ResponseSender<SettingsTransferResponse>
): boolean {
  if (!isSettingsTransferMessage(message)) return false;
  executeSettingsTransferOperation(message).then(
    (result) =>
      sendResponse({
        success: true,
        operation: message.operation,
        ...result,
      } as SettingsTransferResponse),
    (error) => sendResponse(toFailure(message.operation, error))
  );
  return true;
}

function isSettingsTransferMessage(message: unknown): message is SettingsTransferMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === MessageType.SETTINGS_TRANSFER
  );
}

function toFailure(
  operation: SettingsTransferMessage['operation'],
  error: unknown
): SettingsTransferResponse {
  if (error instanceof SettingsTransferStalePlanError) {
    return {
      success: false,
      operation,
      errorCode: 'stale-plan',
      error: 'Settings changed after preview',
    };
  }
  if (error instanceof SettingsTransferRollbackError) {
    return {
      success: false,
      operation,
      errorCode: 'rollback-failed',
      error: 'Settings rollback failed',
    };
  }
  if (error instanceof SettingsTransferQuotaError) {
    return {
      success: false,
      operation,
      errorCode: 'quota-exceeded',
      error: 'Settings storage quota exceeded',
    };
  }
  if (error instanceof SettingsTransferDomainError) {
    return { success: false, operation, errorCode: 'unsupported-domain', error: error.message };
  }
  if (error instanceof SettingsTransferPackageError) {
    return {
      success: false,
      operation,
      errorCode: error.code === 'future-format' ? 'future-format' : 'invalid-package',
      error: error.message,
    };
  }
  if (error instanceof SettingsTransferMissingDependencyError) {
    return {
      success: false,
      operation,
      errorCode: 'invalid-package',
      error: 'Settings package has a missing dependency',
    };
  }
  return {
    success: false,
    operation,
    errorCode: 'commit-failed',
    error: 'Settings transfer failed',
  };
}
