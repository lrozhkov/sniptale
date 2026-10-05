import type { QuickEditZoomRegion } from './types';

/** The sole discriminator for the retained focus collection. */
export function quickEditFocusType(region: Pick<QuickEditZoomRegion, 'spotlight' | 'border'>) {
  return region.border ? 'border' : region.spotlight ? 'spotlight' : 'zoom';
}

/** Authored intervals continue reserving source frames when a cut hides them. */
function quickEditFocusInterval(region: QuickEditZoomRegion) {
  return region.sourceAnchor ?? region;
}

/** Resolve identity and same-kind topology independently of array ordering or other overlays. */
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
        quickEditFocusType(region) === quickEditFocusType(source) &&
        ((quickEditFocusType(source) === 'zoom' &&
          interval(region).start < b.start &&
          interval(region).end > a.end) ||
          region.linkTo === target.id)
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

/** Disposable deterministic lane packing; camera owns row zero and links reserve their gaps. */
export function packQuickEditFocusRows(
  regions: readonly QuickEditZoomRegion[]
): Map<string, number> {
  const rows = new Map<string, number>();
  const ends: number[] = [];
  const sorted = regions
    .filter((region) => !region.dormant)
    .toSorted(
      (a, b) =>
        quickEditFocusInterval(a).start - quickEditFocusInterval(b).start ||
        a.id.localeCompare(b.id)
    );
  for (const region of sorted) {
    if (quickEditFocusType(region) === 'zoom') {
      rows.set(region.id, 0);
      continue;
    }
    const interval = quickEditFocusInterval(region);
    const incoming = sorted.find(
      (item) =>
        resolveQuickEditFocusLink(sorted, item.id, { sourceTime: true })?.target.id === region.id
    );
    let row = incoming
      ? (rows.get(incoming.id) ?? 1) - 1
      : ends.findIndex((end) => end <= interval.start);
    if (row < 0) row = ends.length;
    const link = resolveQuickEditFocusLink(sorted, region.id, { sourceTime: true });
    ends[row] = link ? quickEditFocusInterval(link.target).end : interval.end;
    rows.set(region.id, row + 1);
  }
  return rows;
}
