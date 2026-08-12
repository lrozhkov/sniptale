import {
  moveReorderPreviewToTarget,
  type SettingsCollectionKeyboardPreview,
} from './keyboard-reorder';

function getCollectionRows(
  root: HTMLElement,
  preview: SettingsCollectionKeyboardPreview
): HTMLElement[] {
  const groupItemIds = new Set(preview.itemIds);
  return Array.from(root.querySelectorAll<HTMLElement>('[data-settings-collection-item]')).filter(
    (row) => {
      const itemId = row.dataset['settingsCollectionItem'];
      return itemId !== undefined && itemId !== preview.itemId && groupItemIds.has(itemId);
    }
  );
}

export function movePointerPreviewToClientY(
  root: HTMLElement,
  preview: SettingsCollectionKeyboardPreview,
  clientY: number
): SettingsCollectionKeyboardPreview {
  const rows = getCollectionRows(root, preview);
  const rowBeforePointer = rows.find((row) => {
    const bounds = row.getBoundingClientRect();
    return clientY < bounds.top + bounds.height / 2;
  });
  const targetBeforeId = rowBeforePointer?.dataset['settingsCollectionItem'];
  if (targetBeforeId) {
    return moveReorderPreviewToTarget(preview, targetBeforeId, 'before');
  }

  const finalTargetId = rows.at(-1)?.dataset['settingsCollectionItem'];
  return finalTargetId ? moveReorderPreviewToTarget(preview, finalTargetId, 'after') : preview;
}
