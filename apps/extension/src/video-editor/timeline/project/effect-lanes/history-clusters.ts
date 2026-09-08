const HISTORY_TARGET_HALF_WIDTH = 20;

/** Groups visible history targets after keeping their full hit areas inside the viewport. */
export function clusterHistoryMarkers(
  markers: readonly { id: string; left: number | null }[],
  viewportWidth?: number
) {
  const targets = markers.flatMap((marker) => {
    if (marker.left === null) return [];
    if (viewportWidth === undefined) return [{ id: marker.id, left: marker.left }];
    if (marker.left < 0 || marker.left > viewportWidth) return [];
    return [
      {
        id: marker.id,
        left: Math.max(
          HISTORY_TARGET_HALF_WIDTH,
          Math.min(viewportWidth - HISTORY_TARGET_HALF_WIDTH, marker.left)
        ),
      },
    ];
  });
  const groups: { left: number; ids: string[] }[] = [];
  let right = Number.NEGATIVE_INFINITY;
  for (const target of targets.sort((a, b) => a.left - b.left)) {
    const previous = groups[groups.length - 1];
    if (previous && target.left - HISTORY_TARGET_HALF_WIDTH < right) {
      previous.ids.push(target.id);
      right = target.left + HISTORY_TARGET_HALF_WIDTH;
    } else {
      groups.push({ left: target.left, ids: [target.id] });
      right = target.left + HISTORY_TARGET_HALF_WIDTH;
    }
  }
  return groups;
}

/** Groups typing intervals by their rendered hit rectangles, not only their start points. */
export function clusterHistoryIntervals(
  intervals: readonly { id: string; left: number | null; width: number }[],
  viewportWidth?: number
) {
  const targets = intervals
    .flatMap((interval) => {
      if (interval.left === null) return [];
      const right = interval.left + Math.max(16, interval.width);
      if (viewportWidth !== undefined && (right <= 0 || interval.left >= viewportWidth)) return [];
      const left = viewportWidth === undefined ? interval.left : Math.max(0, interval.left);
      const end = viewportWidth === undefined ? right : Math.min(viewportWidth, right);
      return [{ id: interval.id, left, right: end }];
    })
    .sort((a, b) => a.left - b.left);
  const groups: { left: number; width: number; ids: string[] }[] = [];
  for (const target of targets) {
    const previous = groups[groups.length - 1];
    if (previous && target.left < previous.left + previous.width) {
      previous.width = Math.max(previous.left + previous.width, target.right) - previous.left;
      previous.ids.push(target.id);
    } else {
      groups.push({ left: target.left, width: target.right - target.left, ids: [target.id] });
    }
  }
  return groups;
}
