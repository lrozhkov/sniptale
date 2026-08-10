import { useCallback, useEffect, useRef, useState } from 'react';

import { translate } from '../../../platform/i18n';
import {
  createKeyboardPreview,
  getKeyboardPreviewIntent,
  isKeyboardPreviewCurrent,
  type SettingsCollectionKeyboardPreview,
} from './keyboard-reorder';
import { movePointerPreviewToClientY } from './pointer-reorder';
import type { SettingsCollectionMoveIntent, SettingsCollectionResolvedGroup } from './types';

type PointerSession = {
  active: boolean;
  pointerId: number;
  preview: SettingsCollectionKeyboardPreview;
  root: HTMLElement;
  startX: number;
  startY: number;
};

const POINTER_DRAG_THRESHOLD = 4;

export function useSettingsCollectionPointerReorder(props: {
  announce: (message: string) => void;
  groups: readonly SettingsCollectionResolvedGroup[];
  onMove: ((intent: SettingsCollectionMoveIntent) => void) | undefined;
  resetKeyboardPreview: () => void;
}) {
  const { announce, groups, onMove, resetKeyboardPreview } = props;
  const [preview, setPreview] = useState<SettingsCollectionKeyboardPreview | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const sessionRef = useRef<PointerSession | null>(null);
  const previewRef = useRef<SettingsCollectionKeyboardPreview | null>(null);
  const canMove = onMove !== undefined;

  const clear = useCallback(() => {
    sessionRef.current = null;
    previewRef.current = null;
    setPreview(null);
    setDragOffsetY(0);
  }, []);

  const updatePreview = useCallback((next: SettingsCollectionKeyboardPreview) => {
    previewRef.current = next;
    if (sessionRef.current) sessionRef.current.preview = next;
    setPreview(next);
  }, []);

  useEffect(() => {
    const current = previewRef.current;
    if (current === null) {
      if (!canMove) sessionRef.current = null;
      return;
    }
    if (canMove && isKeyboardPreviewCurrent(groups, current)) return;
    clear();
    announce(translate('settings.collection.announcements.cancelled'));
  }, [announce, canMove, clear, groups]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (!session.active) {
        if (!canMove || !isKeyboardPreviewCurrent(groups, session.preview)) {
          clear();
          return;
        }
        if (
          Math.hypot(event.clientX - session.startX, event.clientY - session.startY) <
          POINTER_DRAG_THRESHOLD
        ) {
          return;
        }
        session.active = true;
        updatePreview(session.preview);
        announce(translate('settings.collection.announcements.pickedUp'));
      }
      setDragOffsetY(event.clientY - session.startY);
      const next = movePointerPreviewToClientY(
        session.root,
        previewRef.current ?? session.preview,
        event.clientY
      );
      if (next !== previewRef.current) updatePreview(next);
    };
    const handleEnd = (event: PointerEvent, cancelled: boolean) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const current = previewRef.current;
      clear();
      if (!session.active) return;
      const intent =
        cancelled || !current ? null : getKeyboardPreviewIntent(groups, current, 'drag');
      if (!intent || !onMove) {
        announce(translate('settings.collection.announcements.cancelled'));
        return;
      }
      onMove(intent);
      announce(translate('settings.collection.announcements.moved'));
    };
    const handleUp = (event: PointerEvent) => handleEnd(event, false);
    const handleCancel = (event: PointerEvent) => handleEnd(event, true);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [announce, canMove, clear, groups, onMove, updatePreview]);

  return {
    preview,
    dragOffsetY,
    clear,
    start(
      itemId: string,
      pointerId: number,
      clientX: number,
      clientY: number,
      root: HTMLElement | null
    ) {
      const next = createKeyboardPreview(groups, itemId);
      if (!root || !next || !canMove || !isKeyboardPreviewCurrent(groups, next)) return;
      resetKeyboardPreview();
      sessionRef.current = {
        active: false,
        pointerId,
        preview: next,
        root,
        startX: clientX,
        startY: clientY,
      };
    },
  };
}
