import type { SettingsTransferJsonValue } from './types';

export function cloneSettingsTransferJsonValue(value: unknown): SettingsTransferJsonValue {
  return cloneValue(value, false);
}

function cloneValue(value: unknown, arrayItem: boolean): SettingsTransferJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item, true));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined || typeof item === 'function' || typeof item === 'symbol'
          ? []
          : [[key, cloneValue(item, false)]]
      )
    );
  }
  if (arrayItem) return null;
  throw new TypeError('Settings transfer value is not JSON serializable');
}
