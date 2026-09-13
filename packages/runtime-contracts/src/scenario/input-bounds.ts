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
