import { GUIDE_LIMITS } from './limits';

/** Rejects hostile object graphs before either scenario document parser traverses them. */
export function isBoundedScenarioInput(value: unknown): boolean {
  const ancestors = new WeakSet<object>();
  let visits = 0;
  let textLength = 0;
  function visit(current: unknown, depth: number): boolean {
    if (++visits > GUIDE_LIMITS.maxInputVisits || depth > GUIDE_LIMITS.maxInputDepth) return false;
    if (typeof current === 'string') {
      textLength += current.length;
      return textLength <= GUIDE_LIMITS.maxInputTextLength;
    }
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'number') return Number.isFinite(current);
    if (typeof current !== 'object' || ancestors.has(current)) return false;
    if (
      !Array.isArray(current) &&
      Object.getPrototypeOf(current) !== Object.prototype &&
      Object.getPrototypeOf(current) !== null
    )
      return false;
    const keys = Object.keys(current);
    if (keys.length + visits > GUIDE_LIMITS.maxInputVisits) return false;
    if (Array.isArray(current) && keys.length !== current.length) return false;
    ancestors.add(current);
    for (const key of keys) {
      textLength += key.length;
      if (textLength > GUIDE_LIMITS.maxInputTextLength) return false;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !('value' in descriptor) || !visit(descriptor.value, depth + 1))
        return false;
    }
    ancestors.delete(current);
    return true;
  }
  return visit(value, 0);
}

/**
 * Checks a privately owned, stable batch consumed synchronously in one read scope.
 * Reused subtree summaries still charge every occurrence to each document's limits.
 * No summary escapes this call or admits a later read of a mutable object.
 */
export function* areBoundedScenarioInputs(
  values: readonly unknown[]
): Generator<boolean, void, unknown> {
  interface Size {
    visits: number;
    text: number;
    depth: number;
  }
  const known = new WeakMap<object, Size>();
  const ancestors = new WeakSet<object>();
  function measure(value: unknown, depth: number): Size | null {
    if (depth > GUIDE_LIMITS.maxInputDepth) return null;
    if (typeof value === 'string')
      return value.length <= GUIDE_LIMITS.maxInputTextLength
        ? { visits: 1, text: value.length, depth: 0 }
        : null;
    if (value === null || typeof value === 'boolean') return { visits: 1, text: 0, depth: 0 };
    if (typeof value === 'number')
      return Number.isFinite(value) ? { visits: 1, text: 0, depth: 0 } : null;
    if (typeof value !== 'object' || ancestors.has(value)) return null;
    const previous = known.get(value);
    if (previous) return previous.depth + depth <= GUIDE_LIMITS.maxInputDepth ? previous : null;
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      return null;
    const keys = Object.keys(value);
    if (
      keys.length + 1 > GUIDE_LIMITS.maxInputVisits ||
      (Array.isArray(value) && keys.length !== value.length)
    )
      return null;
    const size = { visits: 1, text: 0, depth: 0 };
    ancestors.add(value);
    try {
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor)) return null;
        const child = measure(descriptor.value, depth + 1);
        if (!child) return null;
        size.visits += child.visits;
        size.text += key.length + child.text;
        size.depth = Math.max(size.depth, child.depth + 1);
        if (
          size.visits > GUIDE_LIMITS.maxInputVisits ||
          size.text > GUIDE_LIMITS.maxInputTextLength
        )
          return null;
      }
    } finally {
      ancestors.delete(value);
    }
    known.set(value, size);
    return size;
  }
  for (const value of values) yield measure(value, 0) !== null;
}
