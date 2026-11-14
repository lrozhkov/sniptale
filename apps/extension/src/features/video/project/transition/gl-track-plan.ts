import { parseGlTransitionSelection, type GlTransitionSelection } from './gl-catalog';

/** One live explicit junction. Clip order comes from the physical track, not its logical lanes. */
export interface GlTrackJunction {
  id: string;
  leadingClipId: string;
  trailingClipId: string;
  start: number;
  progress: number;
  selection: GlTransitionSelection;
}

/** State leaves retain clip order; consumers apply canonical geometry and source-owned operations. */
export type GlTrackNode =
  | { kind: 'state'; clipIds: readonly string[] }
  | {
      kind: 'gl';
      junction: GlTrackJunction;
      before: GlTrackNode;
      after: GlTrackNode;
    };

type Budget = { layersPerPass: number; totalLayers: number; groupDepth: number };
type Metrics = { layers: number; depth: number };
type Chain = {
  clips: string[];
  edges: GlTrackJunction[];
  start: number;
  position: number;
  id: string;
};
type Result =
  | { ok: true; root: GlTrackNode; metrics: Metrics }
  | { ok: false; reason: 'invalid' | 'resources' };

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveChains(
  clipIds: readonly string[],
  junctions: readonly GlTrackJunction[]
): Chain[] | null {
  const positions = new Map(clipIds.map((id, index) => [id, index]));
  if (positions.size !== clipIds.length) return null;
  const outgoing = new Map<string, GlTrackJunction>();
  const incoming = new Set<string>();
  const ids = new Set<string>();
  for (const edge of junctions) {
    const selection = parseGlTransitionSelection(edge.selection);
    if (
      !selection ||
      ids.has(edge.id) ||
      edge.leadingClipId === edge.trailingClipId ||
      !positions.has(edge.leadingClipId) ||
      !positions.has(edge.trailingClipId) ||
      outgoing.has(edge.leadingClipId) ||
      incoming.has(edge.trailingClipId) ||
      !Number.isFinite(edge.start) ||
      !Number.isFinite(edge.progress) ||
      edge.progress < 0 ||
      edge.progress > 1
    )
      return null;
    ids.add(edge.id);
    outgoing.set(edge.leadingClipId, { ...edge, selection });
    incoming.add(edge.trailingClipId);
  }
  const chains: Chain[] = [];
  let visited = 0;
  for (const edge of junctions) {
    if (incoming.has(edge.leadingClipId)) continue;
    const chain: Chain = {
      clips: [edge.leadingClipId],
      edges: [],
      start: edge.start,
      position: positions.get(edge.leadingClipId)!,
      id: edge.id,
    };
    let next: GlTrackJunction | undefined = outgoing.get(edge.leadingClipId);
    while (next) {
      if (chain.edges.length && next.start < chain.edges[chain.edges.length - 1]!.start)
        return null;
      chain.edges.push(next);
      chain.clips.push(next.trailingClipId);
      chain.start = Math.min(chain.start, next.start);
      chain.position = Math.min(chain.position, positions.get(next.trailingClipId)!);
      if (compareId(next.id, chain.id) < 0) chain.id = next.id;
      visited += 1;
      next = outgoing.get(next.trailingClipId);
      // A bounded visit also refuses malformed cycles before recursive plan construction.
      if (visited > junctions.length) return null;
    }
    chains.push(chain);
  }
  if (visited !== junctions.length) return null;
  return chains.sort(
    (a, b) => a.start - b.start || a.position - b.position || compareId(a.id, b.id)
  );
}

/**
 * Compile physical-track states before acquiring source frames, rasters or GPU leases.
 * Counts expanded occurrences: sharing a state does not make its execution cost disappear.
 * The caller reserves wrapper/operation layers by subtracting them from the supplied budget.
 */
export function buildGlTrackPlan(
  clipIds: readonly string[],
  junctions: readonly GlTrackJunction[],
  budget: Budget
): Result {
  if (Object.values(budget).some((value) => !Number.isSafeInteger(value) || value < 1))
    return { ok: false, reason: 'invalid' };
  // Each live junction requires two child occurrences even before any source content.
  if (junctions.length * 2 > budget.totalLayers || (junctions.length && budget.layersPerPass < 2))
    return { ok: false, reason: 'resources' };
  const chains = resolveChains(clipIds, junctions);
  if (!chains) return { ok: false, reason: 'invalid' };
  const members = new Set(chains.flatMap((chain) => chain.clips));
  const selected = new Set<string>();
  const stateCache = new Map<string, { node: GlTrackNode; metrics: Metrics }>();
  let refused = false;
  let plannedOccurrences = 0;
  const admit = (metrics: Metrics): boolean => {
    if (metrics.layers > budget.totalLayers || metrics.depth > budget.groupDepth) refused = true;
    return !refused;
  };
  const build = (index: number): { node: GlTrackNode; metrics: Metrics } | null => {
    if (refused) return null;
    if (index === chains.length) {
      const ids = clipIds.filter((id) => !members.has(id) || selected.has(id));
      if (ids.length > budget.layersPerPass) {
        refused = true;
        return null;
      }
      const metrics = { layers: ids.length, depth: 1 };
      if (!admit(metrics)) return null;
      const key = JSON.stringify(ids);
      let state = stateCache.get(key);
      if (!state) {
        state = { node: { kind: 'state', clipIds: ids }, metrics };
        stateCache.set(key, state);
      }
      return state;
    }
    // Stop Cartesian expansion while planning, not after the full tree has been allocated.
    plannedOccurrences += 2;
    if (plannedOccurrences > budget.totalLayers || index + 2 > budget.groupDepth) {
      refused = true;
      return null;
    }
    const chain = chains[index]!;
    selected.add(chain.clips[0]!);
    let result = build(index + 1);
    selected.delete(chain.clips[0]!);
    for (const [edgeIndex, edge] of chain.edges.entries()) {
      if (!result) return null;
      selected.add(chain.clips[edgeIndex + 1]!);
      const after = build(index + 1);
      selected.delete(chain.clips[edgeIndex + 1]!);
      if (!after) return null;
      const metrics = {
        layers: 2 + result.metrics.layers + after.metrics.layers,
        depth: 1 + Math.max(result.metrics.depth, after.metrics.depth),
      };
      if (!admit(metrics)) return null;
      result = {
        node: { kind: 'gl', junction: edge, before: result.node, after: after.node },
        metrics,
      };
    }
    return result;
  };
  const result = build(0);
  return result
    ? { ok: true, root: result.node, metrics: result.metrics }
    : { ok: false, reason: 'resources' };
}
