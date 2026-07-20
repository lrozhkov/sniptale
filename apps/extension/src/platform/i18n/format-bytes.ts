import { formatNumber, translate } from './index';

export function formatBytes(bytes: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return translate('shared.bytes.zero');
  }

  const units = [
    translate('shared.bytes.b'),
    translate('shared.bytes.kb'),
    translate('shared.bytes.mb'),
    translate('shared.bytes.gb'),
    translate('shared.bytes.tb'),
  ];
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
