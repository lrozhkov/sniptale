import { useWorkspacePreference } from './workspace-preferences';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { startWindowPointerSession } from '../../interaction/pointer-session';
import { useVideoEditorPreviewPreferences } from './preview-preferences';

function beginVerticalResize(
  event: React.PointerEvent<HTMLDivElement>,
  container: HTMLDivElement,
  paneHeight: number | null,
  setPaneHeight: React.Dispatch<React.SetStateAction<number | null>>
): () => void {
  const bounds = container.getBoundingClientRect();
  const minimumPaneHeight = 220;
  const initialHeight = Math.min(
    bounds.height - 228,
    paneHeight ?? Math.round(bounds.height * 0.6)
  );

  return startWindowPointerSession({
    onCancel: () => setPaneHeight(paneHeight),
    onMove: (moveEvent) => {
      const nextHeight = initialHeight + (moveEvent.clientY - event.clientY);
      setPaneHeight(Math.min(bounds.height - 228, Math.max(minimumPaneHeight, nextHeight)));
    },
  });
}

export function useVideoEditorWorkspacePreviewState() {
  const [sourceViewerActive, setSourceViewerActive] = useState(false);
  const [paneHeight, setPaneHeight] = useWorkspacePreference('previewHeight');
  const workspaceSplitRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const preferences = useVideoEditorPreviewPreferences();

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    },
    []
  );

  const handleStartVerticalResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !workspaceSplitRef.current) return;
      event.preventDefault();
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = beginVerticalResize(
        event,
        workspaceSplitRef.current,
        paneHeight,
        setPaneHeight
      );
    },
    [paneHeight, setPaneHeight]
  );

  const resetPaneHeight = useCallback(() => {
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;
    setPaneHeight(null);
  }, [setPaneHeight]);
  const handleVerticalResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      resetPaneHeight();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const height = workspaceSplitRef.current?.getBoundingClientRect().height;
    if (!height) return;
    event.preventDefault();
    const current = Math.min(height - 228, paneHeight ?? Math.round(height * 0.6));
    setPaneHeight(
      Math.max(220, Math.min(height - 228, current + (event.key === 'ArrowDown' ? 24 : -24)))
    );
  };
  return {
    resetPaneHeight,
    handleVerticalResizeKeyDown,
    handleStartVerticalResize,
    paneHeight,
    preferences,
    workspaceSplitRef,
    sourceViewerActive,
    setSourceViewerActive,
  };
}
