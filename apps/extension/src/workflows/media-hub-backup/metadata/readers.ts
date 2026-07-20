import { translate } from '../../../platform/i18n';

const MAX_BACKUP_METADATA_DESCRIPTORS = 2000;

export type JsonRecord = Record<string, unknown>;

export function failMetadata(): never {
  throw new Error(translate('shared.mediaHub.backupMetadataCorrupted'));
}

export function readRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : failMetadata();
}

export function field(record: JsonRecord, key: string): unknown {
  return record[key];
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : failMetadata();
}

export function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : failMetadata();
}

export function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : failMetadata();
}

export function readNullableString(value: unknown): string | null {
  return value === null ? null : readString(value);
}

export function readNullableNumber(value: unknown): number | null {
  return value === null ? null : readNumber(value);
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString) : failMetadata();
}

export function readRecordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value) || value.length > MAX_BACKUP_METADATA_DESCRIPTORS) {
    failMetadata();
  }

  return value.map((item) => {
    const record = readRecord(item);
    if ('blob' in record) {
      failMetadata();
    }
    return record;
  });
}

export function readPath(value: unknown, prefixes: readonly string[]): string {
  const path = readString(value);
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    failMetadata();
  }

  return prefixes.some((prefix) => path.startsWith(prefix)) ? path : failMetadata();
}

export function readNullablePath(value: unknown, prefixes: readonly string[]): string | null {
  return value === null ? null : readPath(value, prefixes);
}
