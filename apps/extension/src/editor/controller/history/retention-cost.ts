import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';
import type { EditorImageHistoryValueKind } from '../../../features/editor-history/image-snapshot';

interface SnapshotCost {
  metadata: number;
  baseline: number;
  images: number;
  tokens: ReadonlySet<string>;
  privateFavicon?: string;
}

interface RasterBudget {
  kindsByToken: ReadonlyMap<string, EditorImageHistoryValueKind>;
  maxBytes: number;
  maxActions?: number;
  maxAssetBytes: number;
}

interface ResourceDifference {
  leftOnly: string[];
  rightOnly: string[];
}

/** Disposable accounting for immutable pooled snapshots; no document decoding or storage authority. */
export function createEditorHistoryCostIndex(
  tokenBytes: ReadonlyMap<string, number>,
  raster?: RasterBudget
) {
  const snapshots = new Map<string, SnapshotCost>();
  const live = new Map<string, number>();
  const references = new Map<string, number>();
  const privateFaviconReferences = new Map<string, number>();
  const released = new Set<string>();
  const edges = new WeakMap<SnapshotCost, WeakMap<SnapshotCost, ResourceDifference>>();
  let metadataBytes = 0;
  let resourceBytes = 0;
  let imageBytes = 0;
  const isImage = (token: string) => raster?.kindsByToken.get(token) === 'image';

  function requireCost(snapshot: string): SnapshotCost {
    const known = snapshots.get(snapshot);
    if (known) return known;
    // Direct SnapshotHistory callers can supply raw or corrupt strings. Decoding still
    // validates them; unregistered values have metadata cost, never inferred asset refs.
    const metadata = new TextEncoder().encode(snapshot).byteLength;
    const cost = { metadata, baseline: metadata, images: 0, tokens: new Set<string>() };
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
    if (cost.privateFavicon) {
      const total = (privateFaviconReferences.get(cost.privateFavicon) ?? 0) + count;
      if (total === 0) privateFaviconReferences.delete(cost.privateFavicon);
      else privateFaviconReferences.set(cost.privateFavicon, total);
    }
    for (const token of cost.tokens) {
      const before = references.get(token) ?? 0;
      const after = before + count;
      if (after < 0) throw new Error('Invalid editor history resource count.');
      const delta = (before === 0 ? 1 : 0) - (after === 0 ? 1 : 0);
      if (isImage(token)) imageBytes += delta * (tokenBytes.get(token) ?? 0);
      else resourceBytes += delta * (tokenBytes.get(token) ?? 0);
      if (after === 0) {
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

  function measureWindow(values: readonly string[], cursor: number) {
    return createWindowCost(
      values.map(requireCost),
      cursor,
      tokenBytes,
      difference,
      isImage,
      raster
    );
  }

  return {
    referencesFor(snapshot: string) {
      const { tokens, privateFavicon } = requireCost(snapshot);
      return { tokens, privateFavicon };
    },
    register(snapshot: string, tokens: ReadonlySet<string>, privateFavicon?: string) {
      if (snapshots.has(snapshot)) return;
      const metadata = new TextEncoder().encode(snapshot).byteLength;
      let baseline = metadata;
      let images = 0;
      for (const token of tokens) {
        if (isImage(token)) images += tokenBytes.get(token) ?? 0;
        else baseline += tokenBytes.get(token) ?? 0;
      }
      snapshots.set(snapshot, {
        metadata,
        baseline,
        images,
        tokens,
        ...(privateFavicon && isImage(privateFavicon) && tokens.has(privateFavicon)
          ? { privateFavicon }
          : {}),
      });
    },
    measure(values: readonly string[]): number {
      reconcile(values);
      let minimum = Number.POSITIVE_INFINITY;
      for (const snapshot of live.keys())
        minimum = Math.min(minimum, requireCost(snapshot).baseline);
      if (!values.length) return 0;
      if (raster) {
        const newest = requireCost(values[values.length - 1]!);
        const favicon = newest.privateFavicon;
        const sharedFaviconBytes =
          favicon && (references.get(favicon) ?? 0) > (privateFaviconReferences.get(favicon) ?? 0)
            ? (tokenBytes.get(favicon) ?? 0)
            : 0;
        if (imageBytes - newest.images + sharedFaviconBytes > raster.maxAssetBytes)
          return raster.maxBytes + 1;
      }
      return metadataBytes + resourceBytes - minimum;
    },
    measureWindow,
    measureSelectionWindow(values: readonly string[], cursor: number) {
      const measure = measureWindow(values, cursor);
      if (!raster || raster.maxActions === undefined || cursor >= values.length - 1) return measure;
      return preserveAffordableRedo(measure, cursor, values.length - 1, {
        maxActions: raster.maxActions,
        maxBytes: raster.maxBytes,
      });
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

/** A later state can reuse enough raster bytes to make the whole Redo range affordable. */
function preserveAffordableRedo(
  measure: (start: number, end: number) => number,
  cursor: number,
  last: number,
  limits: { maxActions: number; maxBytes: number }
) {
  const entries = Array.from({ length: last }, () => ({ actions: 1, bytes: 0 }));
  const window = selectHistoryRetentionWindow(entries, cursor, limits, measure);
  const end = Math.min(last, window.start + limits.maxActions);
  for (let candidate = end; candidate > window.end; candidate--) {
    if (measure(window.start, candidate) > limits.maxBytes) continue;
    // Admit prefixes only when the complete continuation still fits. The selector keeps
    // all originally accepted positions and can extend Undo if the later state frees room.
    return (start: number, right: number) =>
      right > candidate || candidate - start > limits.maxActions
        ? limits.maxBytes + 1
        : measure(start, candidate);
  }
  return measure;
}

function createWindowCost(
  snapshots: readonly SnapshotCost[],
  cursor: number,
  tokenBytes: ReadonlyMap<string, number>,
  difference: (left: SnapshotCost, right: SnapshotCost) => ResourceDifference,
  isImage: (token: string) => boolean,
  raster?: RasterBudget
) {
  const initial = snapshots[cursor];
  if (!initial) throw new RangeError('Invalid editor history cursor.');
  const priorPublicUses = indexFaviconUses(snapshots);
  // Count contiguous resource runs, not every repeated reference in every snapshot.
  const runs = new Map<string, number>();
  let resources = 0;
  let images = 0;
  for (const token of initial.tokens) {
    runs.set(token, 1);
    if (isImage(token)) images += tokenBytes.get(token) ?? 0;
    else resources += tokenBytes.get(token) ?? 0;
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
      const change = (before === 0 ? 1 : 0) - (after === 0 ? 1 : 0);
      if (isImage(token)) images += change * (tokenBytes.get(token) ?? 0);
      else resources += change * (tokenBytes.get(token) ?? 0);
      if (after === 0) {
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
    if (raster) {
      const newest = snapshots[right]!;
      const favicon = newest.privateFavicon;
      const sharedFaviconBytes =
        favicon && (priorPublicUses?.[right] ?? -1) >= left ? (tokenBytes.get(favicon) ?? 0) : 0;
      if (images - newest.images + sharedFaviconBytes > raster.maxAssetBytes)
        return raster.maxBytes + 1;
    }
    return metadata + resources - minimum;
  };
}

/** Index the last earlier use that a privacy-filtered archive keeps. */
function indexFaviconUses(snapshots: readonly SnapshotCost[]) {
  const favicons = new Set<string>();
  for (const { privateFavicon } of snapshots) if (privateFavicon) favicons.add(privateFavicon);
  if (!favicons.size) return undefined;
  const lastUse = new Map<string, number>();
  return snapshots.map(({ tokens, privateFavicon }, index) => {
    const previous = privateFavicon ? lastUse.get(privateFavicon) : undefined;
    for (const token of tokens) {
      if (token !== privateFavicon && favicons.has(token)) lastUse.set(token, index);
    }
    return previous;
  });
}
