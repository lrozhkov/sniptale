import { parseColor } from '@sniptale/foundation/color';
import { isRecord, isColorString, isBoundedNumber, isEnumValue } from './primitives';

export function isActionClickStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isColorString(value['color']) &&
    parseColor(value['color']) !== null &&
    isBoundedNumber(value['size'], 8, 160) &&
    isBoundedNumber(value['opacity'], 0, 1) &&
    isBoundedNumber(value['strokeWidth'], 1, 12)
  );
}

export function isActionKeyStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEnumValue(value['position'], {
      a: 'bottom-left',
      b: 'bottom-center',
      c: 'bottom-right',
      d: 'top-left',
      e: 'top-center',
      f: 'top-right',
    }) &&
    isEnumValue(value['fontFamily'], { a: 'sans-serif', b: 'serif', c: 'monospace' }) &&
    isEnumValue(value['entrance'], { a: 'fade', b: 'slide', c: 'none' }) &&
    isBoundedNumber(value['fontSize'], 12, 96) &&
    isColorString(value['color']) &&
    parseColor(value['color']) !== null &&
    isColorString(value['background']) &&
    parseColor(value['background']) !== null &&
    isBoundedNumber(value['opacity'], 0, 1) &&
    isBoundedNumber(value['cornerRadius'], 0, 32) &&
    isBoundedNumber(value['margin'], 0, 160)
  );
}
