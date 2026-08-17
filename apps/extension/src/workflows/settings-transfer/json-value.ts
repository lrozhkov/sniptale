import type { SettingsTransferJsonValue } from '../../contracts/settings-transfer';
import { cloneSettingsTransferJsonValue } from '../../contracts/settings-transfer';

export function cloneJsonValue(value: unknown): SettingsTransferJsonValue {
  return cloneSettingsTransferJsonValue(value);
}

export function asSettingsRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
