import { useCallback, useMemo, useState } from 'react';

export interface VideoEditorWorkspaceGridState {
  gridColor: string;
  gridEnabled: boolean;
  gridPopoverOpen: boolean;
  gridSize: number;
  gridSnapEnabled: boolean;
  magnetEnabled: boolean;
  workspacePopoverOpen: boolean;
  closeGridPopover: () => void;
  closeWorkspacePopover: () => void;
  setGridColor: (color: string) => void;
  setGridEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setGridSnapEnabled: (enabled: boolean) => void;
  toggleGridPopover: () => void;
  toggleMagnet: () => void;
  toggleWorkspacePopover: () => void;
}

export function useWorkspaceGridState(): VideoEditorWorkspaceGridState {
  const [workspacePopoverOpen, setWorkspacePopoverOpen] = useState(false);
  const [gridPopoverOpen, setGridPopoverOpen] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(true);
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const [gridSize, setGridSizeState] = useState(80);
  const [gridColor, setGridColor] = useState('#94a3b8');

  const closeGridPopover = useCallback(() => setGridPopoverOpen(false), []);
  const closeWorkspacePopover = useCallback(() => setWorkspacePopoverOpen(false), []);
  const setGridSize = useCallback(
    (size: number) => setGridSizeState(Math.max(4, Math.min(240, Math.round(size)))),
    []
  );
  const toggleGridPopover = useCallback(() => {
    setGridPopoverOpen((value) => !value);
    setWorkspacePopoverOpen(false);
  }, []);
  const toggleMagnet = useCallback(() => setMagnetEnabled((value) => !value), []);
  const toggleWorkspacePopover = useCallback(() => {
    setWorkspacePopoverOpen((value) => !value);
    setGridPopoverOpen(false);
  }, []);

  return useMemo(
    () => ({
      gridColor,
      gridEnabled,
      gridPopoverOpen,
      gridSize,
      gridSnapEnabled,
      magnetEnabled,
      workspacePopoverOpen,
      closeGridPopover,
      closeWorkspacePopover,
      setGridColor,
      setGridEnabled,
      setGridSize,
      setGridSnapEnabled,
      toggleGridPopover,
      toggleMagnet,
      toggleWorkspacePopover,
    }),
    [
      gridColor,
      gridEnabled,
      gridPopoverOpen,
      gridSize,
      gridSnapEnabled,
      magnetEnabled,
      workspacePopoverOpen,
      closeGridPopover,
      closeWorkspacePopover,
      setGridSize,
      toggleGridPopover,
      toggleMagnet,
      toggleWorkspacePopover,
    ]
  );
}
