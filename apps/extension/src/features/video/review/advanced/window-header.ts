import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { QuickEditWindowHeader } from './types';

/** The stored value contains text only; artwork and raster resources are disposable. */
export function parseQuickEditWindowHeader(value: unknown): QuickEditWindowHeader | null {
  if (
    !isRecord(value) ||
    value['kind'] !== 'browser' ||
    typeof value['title'] !== 'string' ||
    value['title'].length > 512 ||
    /[\uD800-\uDFFF]/u.test(value['title'])
  )
    return null;
  return { kind: 'browser', title: value['title'] };
}

/** Keep browser controls legible on narrow source rasters by scaling the complete artwork. */
export function quickEditWindowHeaderSize(sourceWidth: number) {
  return { width: Math.max(784, sourceWidth), height: 86 };
}
