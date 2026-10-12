import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isBoundedNumber } from '../../project/validation/primitives';

/** Pure admission shared by background and webcam; no advanced-state dependency. */
export function parseQuickEditShadow(value: unknown): { intensity: number; color: string } | null {
  if (!isRecord(value) || !isBoundedNumber(value['intensity'], 0, 100)) return null;
  const color = typeof value['color'] === 'string' ? normalizePaintColor(value['color']) : null;
  return color ? { intensity: value['intensity'], color } : null;
}
