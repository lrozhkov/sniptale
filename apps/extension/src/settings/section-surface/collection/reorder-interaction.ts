import { useCallback, useEffect, useId, useState } from 'react';

import { translate } from '../../../platform/i18n';
import {
  createKeyboardPreview,
  getKeyboardPreviewIntent,
  isKeyboardPreviewCurrent,
  moveKeyboardPreview,
  resolveKeyboardPreviewGroups,
  type SettingsCollectionKeyboardPreview,
} from './keyboard-reorder';
import { useSettingsCollectionPointerReorder } from './pointer-reorder-interaction';
import type { SettingsCollectionMoveIntent, SettingsCollectionResolvedGroup } from './types';

export function useSettingsCollectionReorder(
  groups: readonly SettingsCollectionResolvedGroup[],
  onMove: ((intent: SettingsCollectionMoveIntent) => void) | undefined
) {
  const [keyboardPreview, setKeyboardPreview] = useState<SettingsCollectionKeyboardPreview | null>(
    null
  );
  const [announcement, setAnnouncement] = useState({ message: '', sequence: 0 });
  const dragInstructionsId = useId();
  const announce = useCallback((message: string) => {
    setAnnouncement((current) => ({ message, sequence: current.sequence + 1 }));
  }, []);
  const canMove = onMove !== undefined;

  useEffect(() => {
    if (keyboardPreview === null) return;
    if (canMove && isKeyboardPreviewCurrent(groups, keyboardPreview)) return;
    setKeyboardPreview(null);
    announce(translate('settings.collection.announcements.cancelled'));
  }, [announce, canMove, groups, keyboardPreview]);

  const emitMove = useCallback(
    (intent: SettingsCollectionMoveIntent | null) => {
      if (!intent || !onMove) return false;
      onMove(intent);
      setKeyboardPreview(null);
      announce(translate('settings.collection.announcements.moved'));
      return true;
    },
    [announce, onMove]
  );

  const pointer = useSettingsCollectionPointerReorder({
    announce,
    groups,
    onMove,
    resetKeyboardPreview: () => setKeyboardPreview(null),
  });
  const pointerIntent = pointer.preview
    ? getKeyboardPreviewIntent(groups, pointer.preview, 'drag')
    : null;

  return {
    a11y: { announcement, dragInstructionsId, keyboardItemId: keyboardPreview?.itemId ?? null },
    dragOffsetY: pointer.dragOffsetY,
    draggingItemId: pointer.preview?.itemId ?? null,
    groups: resolveKeyboardPreviewGroups(groups, keyboardPreview),
    pointerDropTarget: pointerIntent
      ? { beforeItemId: pointerIntent.beforeItemId, groupId: pointerIntent.groupId }
      : null,
    row: {
      onPointerStart(
        itemId: string,
        pointerId: number,
        clientX: number,
        clientY: number,
        root: HTMLElement | null
      ) {
        pointer.start(itemId, pointerId, clientX, clientY, root);
      },
      onKeyboardToggle(itemId: string) {
        if (keyboardPreview?.itemId === itemId) {
          const intent = getKeyboardPreviewIntent(groups, keyboardPreview);
          setKeyboardPreview(null);
          if (!emitMove(intent)) announce(translate('settings.collection.announcements.cancelled'));
          return;
        }
        const preview = createKeyboardPreview(groups, itemId);
        if (!preview) return;
        pointer.clear();
        setKeyboardPreview(preview);
        announce(translate('settings.collection.announcements.pickedUp'));
      },
      onKeyboardMove(itemId: string, direction: -1 | 1) {
        if (keyboardPreview?.itemId !== itemId) return;
        const next = moveKeyboardPreview(keyboardPreview, direction);
        if (next === keyboardPreview) return;
        setKeyboardPreview(next);
        announce(translate('settings.collection.announcements.moved'));
      },
      onKeyboardCancel() {
        if (keyboardPreview === null) return;
        setKeyboardPreview(null);
        announce(translate('settings.collection.announcements.cancelled'));
      },
      onMove: emitMove,
    },
  };
}

export type SettingsCollectionReorderInteraction = ReturnType<typeof useSettingsCollectionReorder>;
