import { isRecord } from './identity';

export function isImageBitmap(value: unknown): value is ImageBitmap {
  if (!isRecord(value)) return false;
  const constructor = globalThis.ImageBitmap;
  if (typeof constructor === 'function' && !(value instanceof constructor)) return false;
  return (
    typeof value['close'] === 'function' &&
    typeof value['width'] === 'number' &&
    Number.isSafeInteger(value['width']) &&
    value['width'] > 0 &&
    typeof value['height'] === 'number' &&
    Number.isSafeInteger(value['height']) &&
    value['height'] > 0
  );
}

export function closeEffectRuntimeBitmaps(value: unknown): void {
  const pending: Array<{ depth: number; value: unknown }> = [{ depth: 0, value }];
  const visited = new Set<object>();
  let nodes = 0;
  while (pending.length > 0 && nodes < 512) {
    const current = pending.pop()!;
    nodes += 1;
    if (isImageBitmap(current.value)) {
      current.value.close();
      continue;
    }
    if (!canInspectChildren(current, visited)) continue;
    visited.add(current.value);
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    for (const child of children) {
      pending.push({ depth: current.depth + 1, value: child });
    }
  }
}

function canInspectChildren(
  current: { depth: number; value: unknown },
  visited: ReadonlySet<object>
): current is { depth: number; value: object } {
  return (
    current.depth < 8 &&
    current.value !== null &&
    typeof current.value === 'object' &&
    !(current.value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(current.value) &&
    !visited.has(current.value)
  );
}
