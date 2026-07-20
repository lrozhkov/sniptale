import { translate } from '../../../platform/i18n';

function failInvalidBackupArchive(): never {
  throw new Error(translate('shared.mediaHub.backupInvalidArchive'));
}

function isManifestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readManifestRecord(value: unknown): Record<string, unknown> {
  if (!isManifestRecord(value)) {
    failInvalidBackupArchive();
  }
  return value;
}

export function readManifestString(value: unknown): string {
  if (typeof value !== 'string') {
    failInvalidBackupArchive();
  }
  return value;
}

export function readManifestNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failInvalidBackupArchive();
  }
  return value;
}

export function readManifestBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    failInvalidBackupArchive();
  }
  return value;
}
