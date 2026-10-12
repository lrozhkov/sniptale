/** Cost of one indivisible, already admitted group of logical user transitions. */
interface HistoryRetentionCost {
  actions: number;
  bytes: number;
}

/** Caller-owned limits; the primitive has no product defaults or persistence authority. */
interface HistoryRetentionLimits {
  maxActions: number;
  maxBytes: number;
}

interface HistoryRetentionWindow {
  start: number;
  end: number;
  cursor: number;
  actions: number;
  bytes: number;
}

/**
 * Selects a contiguous window nearest the cursor, preferring Undo at equal distance.
 * Costs describe complete groups. An oversized adjacent group closes that side;
 * the current document belongs to the caller and is never discarded by retention.
 */
export function selectHistoryRetentionWindow(
  entries: readonly HistoryRetentionCost[],
  cursor: number,
  limits: HistoryRetentionLimits,
  measureWindowBytes?: (start: number, end: number) => number
): HistoryRetentionWindow {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > entries.length)
    throw new RangeError('Invalid history cursor.');
  if (
    !Number.isSafeInteger(limits.maxActions) ||
    limits.maxActions < 0 ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 0
  )
    throw new RangeError('Invalid history limits.');
  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.actions) ||
      entry.actions < 1 ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0
    )
      throw new RangeError('Invalid history cost.');
  }
  let start = cursor;
  let end = cursor;
  let actions = 0;
  let bytes = 0;
  let undoOpen = start > 0;
  let redoOpen = end < entries.length;
  while (undoOpen || redoOpen) {
    const undo = undoOpen && (!redoOpen || cursor - start <= end - cursor);
    const cost = entries[undo ? start - 1 : end]!;
    const nextBytes = measureWindowBytes
      ? measureWindowBytes(undo ? start - 1 : start, undo ? end : end + 1)
      : bytes + cost.bytes;
    if (!Number.isSafeInteger(nextBytes) || nextBytes < 0)
      throw new RangeError('Invalid history window cost.');
    if (cost.actions > limits.maxActions - actions || nextBytes > limits.maxBytes) {
      if (undo) undoOpen = false;
      else redoOpen = false;
      continue;
    }
    actions += cost.actions;
    bytes = nextBytes;
    if (undo) {
      start--;
      undoOpen = start > 0;
    } else {
      end++;
      redoOpen = end < entries.length;
    }
  }
  return { start, end, cursor: cursor - start, actions, bytes };
}
