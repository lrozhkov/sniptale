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

function usePointerMoveCompletion(announce: (message: string) => void) {
  const [committedPreview, setCommittedPreview] =
    useState<SettingsCollectionKeyboardPreview | null>(null);
  const pendingRef = useRef<SettingsCollectionKeyboardPreview | null>(null);
  useEffect(
    () => () => {
      pendingRef.current = null;
    },
    []
  );
  const complete = (
    current: SettingsCollectionKeyboardPreview,
    result: void | Promise<unknown>
  ) => {
    if (!(result instanceof Promise)) {
      announce(translate('settings.collection.announcements.moved'));
      return;
    }
    pendingRef.current = current;
    setCommittedPreview(current);
    void result
      .then(
        (accepted) => {
          if (pendingRef.current === current)
            announce(
              translate(
                accepted === false
                  ? 'settings.collection.announcements.cancelled'
                  : 'settings.collection.announcements.moved'
              )
            );
        },
        () => {
          if (pendingRef.current === current)
            announce(translate('settings.collection.announcements.cancelled'));
        }
      )
      .finally(() => {
        if (pendingRef.current !== current) return;
        pendingRef.current = null;
        setCommittedPreview(null);
      });
  };
  return { committedPreview, complete, isPending: () => pendingRef.current !== null };
}

export function useSettingsCollectionPointerReorder(props: {
  announce: (message: string) => void;
  groups: readonly SettingsCollectionResolvedGroup[];
  onMove: ((intent: SettingsCollectionMoveIntent) => void | Promise<unknown>) | undefined;
  resetKeyboardPreview: () => void;
}) {
  const { announce, groups, onMove, resetKeyboardPreview } = props;
  const [preview, setPreview] = useState<SettingsCollectionKeyboardPreview | null>(null);
  const completion = usePointerMoveCompletion(announce);
  const sessionRef = useRef<PointerSession | null>(null);
  const previewRef = useRef<SettingsCollectionKeyboardPreview | null>(null);
  const canMove = onMove !== undefined;

  const clear = useCallback(() => {
    sessionRef.current = null;
    previewRef.current = null;
    setPreview(null);
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
      const next = movePointerPreviewToClientY(
        session.root,
        previewRef.current ?? session.preview,
        event.clientY,
        event.clientX
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
      if (!intent || !onMove || !current) {
        announce(translate('settings.collection.announcements.cancelled'));
        return;
      }
      completion.complete(current, onMove(intent));
    };
    const cancelSession = () => {
      const session = sessionRef.current;
      if (!session) return;
      clear();
      if (session.active) announce(translate('settings.collection.announcements.cancelled'));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !sessionRef.current) return;
      event.preventDefault();
      cancelSession();
    };
    const handleUp = (event: PointerEvent) => handleEnd(event, false);
    const handleCancel = (event: PointerEvent) => handleEnd(event, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', cancelSession);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', cancelSession);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [announce, canMove, clear, completion, groups, onMove, updatePreview]);

  return {
    preview,
    committedPreview: completion.committedPreview,
    clear,
    start(
      itemId: string,
      pointerId: number,
      clientX: number,
      clientY: number,
      root: HTMLElement | null
    ) {
      const next = createKeyboardPreview(groups, itemId);
      if (
        completion.isPending() ||
        !root ||
        !next ||
        !canMove ||
        !isKeyboardPreviewCurrent(groups, next)
      )
        return;
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
