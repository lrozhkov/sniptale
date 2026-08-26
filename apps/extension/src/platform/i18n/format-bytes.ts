import { formatNumber, translate } from './index';

function getByteUnits(): string[] {
  return [
    translate('shared.bytes.b'),
    translate('shared.bytes.kb'),
    translate('shared.bytes.mb'),
    translate('shared.bytes.gb'),
    translate('shared.bytes.tb'),
  ];
}

export function formatBytes(bytes: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return translate('shared.bytes.zero');
  }

  const units = getByteUnits();
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${formatNumber(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })} ${units[unitIndex]}`;
}

export function formatCompactBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return translate('shared.bytes.zero');
  }

  const units = getByteUnits();
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  while (unitIndex > 0 && value >= 100 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const maximumFractionDigits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${formatNumber(value, { maximumFractionDigits })} ${units[unitIndex]}`;
}
