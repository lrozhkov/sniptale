import type { StorageCleanupGroup } from '../../../../features/media-hub/types';

export {
  createMediaItem,
  createScenarioExportItem,
  createScenarioItem,
  createVideoProjectItem,
} from '../../test-support/items';

export function createCleanupGroup(
  overrides: Partial<StorageCleanupGroup> = {}
): StorageCleanupGroup {
  return {
    id: overrides.id ?? 'heavy-files',
    title: overrides.title ?? 'Тяжёлые файлы',
    description: overrides.description ?? 'Описание',
    irreversibleLabel: overrides.irreversibleLabel ?? 'Необратимо',
    potentialBytes: overrides.potentialBytes ?? 1024,
    items: overrides.items ?? [
      {
        id: 'asset-1',
        filename: 'capture.png',
        size: 1024,
        createdAt: 1,
        kind: 'image',
        target: 'asset',
      },
    ],
  };
}
