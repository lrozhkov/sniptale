import type { QuickEditZoomRegion } from './types';

/** The sole discriminator for the retained focus collection. */
export function quickEditFocusType(region: Pick<QuickEditZoomRegion, 'spotlight' | 'border'>) {
  return region.border ? 'border' : region.spotlight ? 'spotlight' : 'zoom';
}

/** Authored intervals continue reserving source frames when a cut hides them. */
function quickEditFocusInterval(region: QuickEditZoomRegion) {
  return region.sourceAnchor ?? region;
}

/** Resolve compatible neighbors without crossing any active focus interval. */
export function resolveQuickEditFocusLink(
  regions: readonly QuickEditZoomRegion[],
  id: string,
  options: { sourceTime?: boolean } = {}
): { source: QuickEditZoomRegion; target: QuickEditZoomRegion } | null {
  const source = regions.find((region) => region.id === id && !region.dormant);
  if (!source?.linkTo || quickEditFocusType(source) === 'border') return null;
  const target = regions.find((region) => region.id === source.linkTo && !region.dormant);
  if (!target || quickEditFocusType(source) !== quickEditFocusType(target)) return null;
  const interval = (region: QuickEditZoomRegion) =>
    options.sourceTime ? quickEditFocusInterval(region) : region;
  const a = interval(source);
  const b = interval(target);
  if (b.start <= a.end) return null;
  if (
    regions.some(
      (region) =>
        !region.dormant &&
        region.id !== source.id &&
        region.id !== target.id &&
        ((interval(region).start < b.start && interval(region).end > a.end) ||
          (interval(region).end === a.end &&
            quickEditFocusType(region) === quickEditFocusType(source) &&
            region.linkTo === target.id))
    )
  )
    return null;
  return { source, target };
}

/** Camera-only collisions include valid authored link gaps, with half-open boundaries. */
export function quickEditFocusConflicts(
  regions: readonly QuickEditZoomRegion[],
  candidate: QuickEditZoomRegion,
  excludeId = candidate.id
): boolean {
  if (candidate.dormant || quickEditFocusType(candidate) !== 'zoom') return false;
  const a = quickEditFocusInterval(candidate);
  const others = regions.filter((region) => region.id !== excludeId);
  return others.some((region) => {
    if (region.dormant || quickEditFocusType(region) !== 'zoom') return false;
    const b = quickEditFocusInterval(region);
    const link = resolveQuickEditFocusLink(others, region.id, { sourceTime: true });
    const end = link ? quickEditFocusInterval(link.target).start : b.end;
    return a.start < end && a.end > b.start;
  });
}

/** Disposable first-fit packing; camera and complete linked chains reserve their spans. */
export function packQuickEditFocusRows(
  regions: readonly QuickEditZoomRegion[]
): Map<string, number> {
  const rows = new Map<string, number>();
  const sorted = regions
    .filter((region) => !region.dormant)
    .toSorted(
      (a, b) =>
        quickEditFocusInterval(a).start - quickEditFocusInterval(b).start ||
        a.id.localeCompare(b.id)
    );
  const targets = new Map<string, QuickEditZoomRegion>();
  const incoming = new Set<string>();
  for (const region of sorted) {
    const link = resolveQuickEditFocusLink(sorted, region.id, { sourceTime: true });
    if (link) {
      targets.set(region.id, link.target);
      incoming.add(link.target.id);
    }
  }
  const chains = sorted
    .filter((region) => !incoming.has(region.id))
    .map((first) => {
      const members = [first];
      let last = first;
      while (targets.has(last.id)) {
        last = targets.get(last.id)!;
        members.push(last);
      }
      return {
        members,
        start: quickEditFocusInterval(first).start,
        end: quickEditFocusInterval(last).end,
      };
    });
  const lanes: { start: number; end: number }[][] = [[]];
  for (const chain of chains.filter((item) => quickEditFocusType(item.members[0]!) === 'zoom')) {
    lanes[0]!.push(chain);
    for (const member of chain.members) rows.set(member.id, 0);
  }
  for (const chain of chains.filter((item) => quickEditFocusType(item.members[0]!) !== 'zoom')) {
    let row = lanes.findIndex((lane) =>
      lane.every((span) => chain.start >= span.end || chain.end <= span.start)
    );
    if (row < 0) {
      row = lanes.length;
      lanes.push([]);
    }
    lanes[row]!.push(chain);
    for (const member of chain.members) rows.set(member.id, row);
  }
  return rows;
}
