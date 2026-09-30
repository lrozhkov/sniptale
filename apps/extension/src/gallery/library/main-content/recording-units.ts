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
