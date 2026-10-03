import { isGalleryMediaItem, type GalleryItem } from '../items';

type GalleryListUnit =
  | { kind: 'item'; item: GalleryItem }
  | {
      representativeId: string;
      groupId: string;
      items: GalleryItem[];
      kind: 'recording-group';
      memberCount: number;
    };

export function buildGalleryListUnits(items: GalleryItem[]): GalleryListUnit[] {
  const groupedItems = new Map<string, GalleryItem[]>();
  items.forEach((item) => {
    if (!isGalleryMediaItem(item) || !item.recordingGroupView) return;
    const members = groupedItems.get(item.recordingGroupView.groupId) ?? [];
    members.push(item);
    groupedItems.set(item.recordingGroupView.groupId, members);
  });
  groupedItems.forEach((members) => {
    members.sort((left, right) => {
      if (!isGalleryMediaItem(left) || !isGalleryMediaItem(right)) return 0;
      return (left.recordingGroupView?.order ?? 0) - (right.recordingGroupView?.order ?? 0);
    });
  });

  const emittedGroups = new Set<string>();
  return items.flatMap((item): GalleryListUnit[] => {
    if (!isGalleryMediaItem(item) || !item.recordingGroupView) {
      return [{ item, kind: 'item' }];
    }
    const { groupId, memberCount } = item.recordingGroupView;
    if (emittedGroups.has(groupId)) return [];
    emittedGroups.add(groupId);
    return [
      {
        representativeId: item.id,
        groupId,
        items: groupedItems.get(groupId) ?? [item],
        kind: 'recording-group',
        memberCount,
      },
    ];
  });
}

export const GALLERY_LIST_HEADER_HEIGHT = 48;
export const GALLERY_LIST_ROW_HEIGHT = 94;

/** Row geometry follows the same grouping and member order as rendering and keyboard traversal. */
export function buildGalleryListLayout(items: GalleryItem[]) {
  const units = buildGalleryListUnits(items);
  const rows: GalleryItem[] = [];
  const rowTops: number[] = [];
  const rowBottoms: number[] = [];
  const unitByItem = new Map<string, number>();
  const rowIndices = new Map<string, number>();
  let rowCount = 1;
  let top = GALLERY_LIST_HEADER_HEIGHT;
  const positionedUnits = units.map((unit, index) => {
    if (unit.kind === 'recording-group' && units[index - 1]?.kind === 'recording-group') top -= 8;
    const start = top;
    const headerIndex = unit.kind === 'recording-group' ? ++rowCount : undefined;
    if (unit.kind === 'recording-group') top += 8 + 1 + 32;
    for (const item of unit.kind === 'item' ? [unit.item] : unit.items) {
      unitByItem.set(item.id, index);
      rowIndices.set(item.id, ++rowCount);
      rows.push(item);
      rowTops.push(top);
      top += GALLERY_LIST_ROW_HEIGHT;
      rowBottoms.push(top);
    }
    if (unit.kind === 'recording-group') top += 1 + 8;
    return { unit, top: start, height: top - start, headerIndex };
  });
  rowTops.push(top);
  return {
    rows,
    rowTops,
    rowBottoms,
    positionedUnits,
    unitByItem,
    rowIndices,
    rowCount,
    totalHeight: top,
  };
}
