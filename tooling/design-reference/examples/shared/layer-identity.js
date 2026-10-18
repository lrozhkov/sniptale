let serial = 0;

/** Allocate IDs in the shared anchored, modal and curtain construction order. */
export function nextLayerId(prefix) {
  return prefix + ++serial;
}
