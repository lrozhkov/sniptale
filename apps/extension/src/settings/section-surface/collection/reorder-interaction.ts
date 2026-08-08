import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { translate } from '../../../platform/i18n';
import {
  createKeyboardPreview,
  getKeyboardPreviewIntent,
  isKeyboardPreviewCurrent,
  moveKeyboardPreview,
  resolveKeyboardPreviewGroups,
  type SettingsCollectionKeyboardPreview,
} from './keyboard-reorder';
import { getSettingsCollectionMoveIntent } from './model';
import type { SettingsCollectionMoveIntent, SettingsCollectionResolvedGroup } from './types';

export function useSettingsCollectionReorder(
  groups: readonly SettingsCollectionResolvedGroup[],
  onMove: ((intent: SettingsCollectionMoveIntent) => void) | undefined
) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragBaseline, setDragBaseline] = useState<SettingsCollectionKeyboardPreview | null>(null);
  const [keyboardPreview, setKeyboardPreview] = useState<SettingsCollectionKeyboardPreview | null>(
    null
  );
  const [announcement, setAnnouncement] = useState({ message: '', sequence: 0 });
  const dragInstructionsId = useId();
  const draggedItemRef = useRef<string | null>(null);
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
  useEffect(() => {
    if (dragBaseline === null) return;
    if (canMove && isKeyboardPreviewCurrent(groups, dragBaseline)) return;
    draggedItemRef.current = null;
    setDraggedItemId(null);
    setDragBaseline(null);
    announce(translate('settings.collection.announcements.cancelled'));
  }, [announce, canMove, dragBaseline, groups]);
  const emitMove = (intent: SettingsCollectionMoveIntent | null) => {
    if (!intent || !onMove) return false;
    onMove(intent);
    setKeyboardPreview(null);
    announce(translate('settings.collection.announcements.moved'));
    return true;
  };

  return {
    a11y: { announcement, dragInstructionsId, keyboardItemId: keyboardPreview?.itemId ?? null },
    groups: resolveKeyboardPreviewGroups(groups, keyboardPreview),
    row: {
      onDragStart(itemId: string) {
        const baseline = createKeyboardPreview(groups, itemId);
        if (!baseline || !canMove || !isKeyboardPreviewCurrent(groups, baseline)) return;
        setKeyboardPreview(null);
        draggedItemRef.current = itemId;
        setDraggedItemId(itemId);
        setDragBaseline(baseline);
        announce(translate('settings.collection.announcements.pickedUp'));
      },
      onDragEnd() {
        if (draggedItemRef.current === null) return;
        draggedItemRef.current = null;
        setDraggedItemId(null);
        setDragBaseline(null);
        announce(translate('settings.collection.announcements.cancelled'));
      },
      onDrop(targetItemId: string, placement: 'before' | 'after') {
        const activeDragIsCurrent =
          dragBaseline !== null &&
          draggedItemId === dragBaseline.itemId &&
          canMove &&
          isKeyboardPreviewCurrent(groups, dragBaseline);
        const intent = !activeDragIsCurrent
          ? null
          : getSettingsCollectionMoveIntent({
              groups,
              itemId: dragBaseline.itemId,
              targetItemId,
              placement,
              source: 'drag',
            });
        if (!emitMove(intent) && draggedItemId !== null)
          announce(translate('settings.collection.announcements.cancelled'));
        draggedItemRef.current = null;
        setDraggedItemId(null);
        setDragBaseline(null);
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
