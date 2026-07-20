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
  const initialHeight = paneHeight ?? Math.round(bounds.height * 0.6);

  return startWindowPointerSession({
    onMove: (moveEvent) => {
      const nextHeight = initialHeight + (moveEvent.clientY - event.clientY);
      setPaneHeight(
        Math.min(bounds.height - minimumPaneHeight, Math.max(minimumPaneHeight, nextHeight))
      );
    },
  });
}

export function useVideoEditorWorkspacePreviewState() {
  const [paneHeight, setPaneHeight] = useState<number | null>(null);
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
      if (!workspaceSplitRef.current) return;
      event.preventDefault();
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = beginVerticalResize(
        event,
        workspaceSplitRef.current,
        paneHeight,
        setPaneHeight
      );
    },
    [paneHeight]
  );

  return { handleStartVerticalResize, paneHeight, preferences, workspaceSplitRef };
}
