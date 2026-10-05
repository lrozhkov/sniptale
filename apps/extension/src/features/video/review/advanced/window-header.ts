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
  const url = value['url'];
  if (
    url !== undefined &&
    (typeof url !== 'string' || url.length > 2048 || /[\uD800-\uDFFF]/u.test(url))
  )
    return null;
  return { kind: 'browser', title: value['title'], ...(url === undefined ? {} : { url }) };
}

/** Keep browser controls legible on narrow source rasters by scaling the complete artwork. */
export function quickEditWindowHeaderSize(sourceWidth: number) {
  return { width: Math.max(784, sourceWidth), height: 86 };
}
