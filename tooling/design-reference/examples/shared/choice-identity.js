let serial = 0;

/** Allocate IDs in the shared dropdown and property construction order. */
export function nextChoiceId(prefix) {
  return prefix + ++serial;
}
