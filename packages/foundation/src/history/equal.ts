/** Compare admitted history arrays using the owning operation's recursive equality. */
export function sameHistoryArray(
  left: readonly unknown[],
  right: readonly unknown[],
  equal: (left: unknown, right: unknown) => boolean
): boolean {
  return left.length === right.length && left.every((value, index) => equal(value, right[index]));
}
/** Compare own enumerable fields; callers retain their record and primitive admission. */
export function sameHistoryRecord(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  equal: (left: unknown, right: unknown) => boolean
): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
  );
}
