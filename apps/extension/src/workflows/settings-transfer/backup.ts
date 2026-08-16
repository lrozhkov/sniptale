import type { SettingsTransferDomainPayload } from '../../contracts/settings-transfer';
import { SETTINGS_TRANSFER_DOMAIN_IDS } from './registry';

export function isCompleteSettingsTransferBackup(args: {
  imported: Record<string, SettingsTransferDomainPayload>;
  current: Record<string, SettingsTransferDomainPayload>;
}): boolean {
  return SETTINGS_TRANSFER_DOMAIN_IDS.every((domainId) => {
    const importedData = asRecord(args.imported[domainId]?.data);
    const currentData = asRecord(args.current[domainId]?.data);
    return (
      importedData !== null &&
      currentData !== null &&
      Object.keys(currentData).every((key) => Object.hasOwn(importedData, key))
    );
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
