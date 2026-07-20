import { formatNumber } from '../../svg/format';

export function formatSvgMetric(value: number): string {
  return formatNumber(value);
}

export function scaleSvgMetric(value: number, scale: number): string {
  return formatSvgMetric(value * scale);
}
