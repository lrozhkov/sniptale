interface SnapshotCost {
  metadata: number;
  baseline: number;
  tokens: ReadonlySet<string>;
}

interface ResourceDifference {
  leftOnly: string[];
  rightOnly: string[];
}

/** Disposable accounting for immutable pooled snapshots; no document decoding or storage authority. */
export function createEditorHistoryCostIndex(tokenBytes: ReadonlyMap<string, number>) {
  const snapshots = new Map<string, SnapshotCost>();
  const live = new Map<string, number>();
  const references = new Map<string, number>();
  const released = new Set<string>();
  const edges = new WeakMap<SnapshotCost, WeakMap<SnapshotCost, ResourceDifference>>();
  let metadataBytes = 0;
  let resourceBytes = 0;

  function requireCost(snapshot: string): SnapshotCost {
    const known = snapshots.get(snapshot);
    if (known) return known;
    // Direct SnapshotHistory callers can supply raw or corrupt strings. Decoding still
    // validates them; unregistered values have metadata cost, never inferred asset refs.
    const metadata = new TextEncoder().encode(snapshot).byteLength;
    const cost = { metadata, baseline: metadata, tokens: new Set<string>() };
    snapshots.set(snapshot, cost);
    return cost;
  }

  function difference(left: SnapshotCost, right: SnapshotCost): ResourceDifference {
    let following = edges.get(left);
    if (!following) {
      following = new WeakMap();
      edges.set(left, following);
    }
    let edge = following.get(right);
    if (!edge) {
      edge = {
        leftOnly: [...left.tokens].filter((token) => !right.tokens.has(token)),
        rightOnly: [...right.tokens].filter((token) => !left.tokens.has(token)),
      };
      following.set(right, edge);
    }
    return edge;
  }

  function adjust(snapshot: string, count: number): void {
    const cost = requireCost(snapshot);
    metadataBytes += cost.metadata * count;
    for (const token of cost.tokens) {
      const before = references.get(token) ?? 0;
      const after = before + count;
      if (after < 0) throw new Error('Invalid editor history resource count.');
      if (before === 0) resourceBytes += tokenBytes.get(token) ?? 0;
      if (after === 0) {
        resourceBytes -= tokenBytes.get(token) ?? 0;
        references.delete(token);
        released.add(token);
      } else references.set(token, after);
    }
  }

  function reconcile(values: readonly string[]): void {
    const next = new Map<string, number>();
    let previous: SnapshotCost | undefined;
    for (const snapshot of values) {
      next.set(snapshot, (next.get(snapshot) ?? 0) + 1);
      const cost = requireCost(snapshot);
      if (previous) difference(previous, cost);
      previous = cost;
    }
    for (const [snapshot, count] of live) {
      const delta = (next.get(snapshot) ?? 0) - count;
      if (delta) adjust(snapshot, delta);
    }
    for (const [snapshot, count] of next) {
      if (!live.has(snapshot)) adjust(snapshot, count);
    }
    live.clear();
    for (const [snapshot, count] of next) live.set(snapshot, count);
  }

  return {
    register(snapshot: string, tokens: ReadonlySet<string>) {
      if (snapshots.has(snapshot)) return;
      const metadata = new TextEncoder().encode(snapshot).byteLength;
      let baseline = metadata;
      for (const token of tokens) baseline += tokenBytes.get(token) ?? 0;
      snapshots.set(snapshot, { metadata, baseline, tokens });
    },
    measure(values: readonly string[]): number {
      reconcile(values);
      let minimum = Number.POSITIVE_INFINITY;
      for (const snapshot of live.keys())
        minimum = Math.min(minimum, requireCost(snapshot).baseline);
      return values.length ? metadataBytes + resourceBytes - minimum : 0;
    },
    measureWindow(values: readonly string[], cursor: number) {
      return createWindowCost(values.map(requireCost), cursor, tokenBytes, difference);
    },
    retain(values: readonly string[]) {
      reconcile(values);
      const discarded: string[] = [];
      for (const snapshot of snapshots.keys()) {
        if (live.has(snapshot)) continue;
        snapshots.delete(snapshot);
        discarded.push(snapshot);
      }
      const tokens = [...released].filter((token) => !references.has(token));
      released.clear();
      return { snapshots: discarded, tokens };
    },
  };
}

function createWindowCost(
  snapshots: readonly SnapshotCost[],
  cursor: number,
  tokenBytes: ReadonlyMap<string, number>,
  difference: (left: SnapshotCost, right: SnapshotCost) => ResourceDifference
) {
  const initial = snapshots[cursor];
  if (!initial) throw new RangeError('Invalid editor history cursor.');
  // Count contiguous resource runs, not every repeated reference in every snapshot.
  const runs = new Map<string, number>();
  let resources = 0;
  for (const token of initial.tokens) {
    runs.set(token, 1);
    resources += tokenBytes.get(token) ?? 0;
  }
  let left = cursor;
  let right = cursor;
  let metadata = initial.metadata;
  let minimum = initial.baseline;

  function adjust(tokens: readonly string[], delta: number): void {
    for (const token of tokens) {
      const before = runs.get(token) ?? 0;
      const after = before + delta;
      if (after < 0) throw new Error('Invalid editor history resource run.');
      if (before === 0) resources += tokenBytes.get(token) ?? 0;
      if (after === 0) {
        resources -= tokenBytes.get(token) ?? 0;
        runs.delete(token);
      } else runs.set(token, after);
    }
  }

  function remove(cost: SnapshotCost): void {
    metadata -= cost.metadata;
    if (cost.baseline === minimum) minimum = Number.POSITIVE_INFINITY;
  }

  function add(cost: SnapshotCost): void {
    metadata += cost.metadata;
    if (Number.isFinite(minimum)) minimum = Math.min(minimum, cost.baseline);
  }

  return (start: number, end: number): number => {
    if (start < 0 || end >= snapshots.length || start > cursor || end < cursor)
      throw new RangeError('Invalid editor history window.');
    while (left < start) {
      adjust(difference(snapshots[left]!, snapshots[left + 1]!).leftOnly, -1);
      remove(snapshots[left++]!);
    }
    while (right > end) {
      adjust(difference(snapshots[right - 1]!, snapshots[right]!).rightOnly, -1);
      remove(snapshots[right--]!);
    }
    while (left > start) {
      adjust(difference(snapshots[left - 1]!, snapshots[left]!).leftOnly, 1);
      add(snapshots[--left]!);
    }
    while (right < end) {
      adjust(difference(snapshots[right]!, snapshots[right + 1]!).rightOnly, 1);
      add(snapshots[++right]!);
    }
    if (!Number.isFinite(minimum)) {
      for (let index = left; index <= right; index++)
        minimum = Math.min(minimum, snapshots[index]!.baseline);
    }
    return metadata + resources - minimum;
  };
}
