import { isString } from '../../../../composition/persistence/infrastructure/guards/primitives';

interface ParsedSaveAsDirectoryStorageValue {
  hasInvalidValue: boolean;
  value: string;
}

function containsUnsafePathSegment(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment === '.' || segment === '..');
}

function isAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]|^[\\/]/.test(value);
}

export function parseStoredSaveAsDirectory(value: unknown): ParsedSaveAsDirectoryStorageValue {
  if (value === undefined) {
    return { value: '', hasInvalidValue: false };
  }

  if (!isString(value)) {
    return { value: '', hasInvalidValue: true };
  }

  if (value.length === 0) {
    return { value, hasInvalidValue: false };
  }

  if (isAbsolutePath(value) || containsUnsafePathSegment(value)) {
    return { value: '', hasInvalidValue: true };
  }

  return { value, hasInvalidValue: false };
}
