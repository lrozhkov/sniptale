import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type {
  ContentToolbarDisplayMode,
  ContentToolbarDockEdge,
  ContentToolbarPosition,
} from '../../../../contracts/settings';
import {
  useToolbarDragListeners,
  useToolbarPositionInitialization,
  useToolbarPreferencePersistence,
  useToolbarPreferencesState,
  useToolbarViewportClamping,
} from './drag-position.effects';
import { useToolbarDragController } from './drag-position.controller';
import { useContentUiScale } from '../../../platform/dom-host';
import { getToolbarDockDisplayMode } from './docking';

export type ToolbarDragPositionState = {
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  freePlacement: boolean;
  dockPreview: ContentToolbarDockEdge | null;
  handleMouseDown: (event: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => void;
  isDragging: boolean;
  position: ContentToolbarPosition;
  positionReady: boolean;
  setCompactMenus: Dispatch<SetStateAction<boolean>>;
  setDisplayMode: Dispatch<SetStateAction<ContentToolbarDisplayMode>>;
  setFreePlacement: Dispatch<SetStateAction<boolean>>;
  toolbarRef: RefObject<HTMLDivElement | null>;
};

export function useToolbarDragPosition(
  currentViewport: { width: number; height: number } | null
): ToolbarDragPositionState {
  const [position, setPosition] = useState<ContentToolbarPosition>({ x: 0, y: 8 });
  const [dockPreview, setDockPreview] = useState<ContentToolbarDockEdge | null>(null);
  const uiScale = useContentUiScale();
  const { dragOffset, handleMouseDown, isDragging, setIsDragging, toolbarRef } =
    useToolbarDragController(position, uiScale);
  const preferences = useToolbarPreferencesState();
  const {
    compactMenus,
    freePlacement,
    dockEdge,
    preferencesReady,
    savedPosition,
    setDisplayMode: setPreferredDisplayMode,
    setFreePlacement: setFreePlacementPreference,
  } = preferences;
  const displayMode = freePlacement ? preferences.displayMode : getToolbarDockDisplayMode(dockEdge);
  const dockLayout = freePlacement || isDragging ? {} : { dockEdge };
  const stopDragging = useCallback(() => setIsDragging(false), [setIsDragging]);
  const setFreePlacement = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      const next = typeof value === 'function' ? value(freePlacement) : value;
      // Enter free placement without rotating the toolbar away from its current dock orientation.
      if (next && !freePlacement) setPreferredDisplayMode(displayMode);
      setFreePlacementPreference(next);
    },
    [freePlacement, displayMode, setPreferredDisplayMode, setFreePlacementPreference]
  );

  const positionReady = useToolbarPositionInitialization({
    preferencesReady,
    savedPosition,
    setPosition,
    toolbarRef,
    uiScale,
    ...dockLayout,
  });
  useToolbarViewportClamping({
    currentViewport,
    displayMode,
    isInitialized: positionReady,
    setPosition,
    toolbarRef,
    uiScale,
    ...dockLayout,
  });
  useToolbarPreferencePersistence({
    compactMenus,
    displayMode,
    freePlacement,
    dockEdge,
    isDragging,
    isInitialized: positionReady,
    position,
    preferencesReady,
  });
  useToolbarDragListeners({
    dragOffset,
    isDragging,
    freePlacement,
    setPosition,
    stopDragging,
    toolbarRef,
    uiScale,
    setPreviewEdge: setDockPreview,
    setDockEdge: preferences.setDockEdge,
  });

  return {
    compactMenus,
    displayMode,
    freePlacement,
    dockPreview,
    handleMouseDown,
    isDragging,
    position,
    positionReady,
    setCompactMenus: preferences.setCompactMenus,
    setDisplayMode: preferences.setDisplayMode,
    setFreePlacement,
    toolbarRef,
  };
}
