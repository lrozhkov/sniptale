import { useState } from 'react';

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
  const [gridSize, setGridSize] = useState(80);
  const [gridColor, setGridColor] = useState('#94a3b8');

  return {
    gridColor,
    gridEnabled,
    gridPopoverOpen,
    gridSize,
    gridSnapEnabled,
    magnetEnabled,
    workspacePopoverOpen,
    closeGridPopover: () => setGridPopoverOpen(false),
    closeWorkspacePopover: () => setWorkspacePopoverOpen(false),
    setGridColor,
    setGridEnabled,
    setGridSize: (size) => setGridSize(Math.max(4, Math.min(240, Math.round(size)))),
    setGridSnapEnabled,
    toggleGridPopover: () => {
      setGridPopoverOpen((value) => !value);
      setWorkspacePopoverOpen(false);
    },
    toggleMagnet: () => setMagnetEnabled((value) => !value),
    toggleWorkspacePopover: () => {
      setWorkspacePopoverOpen((value) => !value);
      setGridPopoverOpen(false);
    },
  };
}
