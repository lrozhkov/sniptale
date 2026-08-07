import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type {
  ContentToolbarDisplayMode,
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

const DEFAULT_TOOLBAR_TOP = 5;

export type ToolbarDragPositionState = {
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
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
  toolbarRef: RefObject<HTMLDivElement | null>;
};

function useToolbarPreferenceLifecycle(args: {
  compactMenus: boolean;
  currentViewport: { width: number; height: number } | null;
  displayMode: ContentToolbarDisplayMode;
  isDragging: boolean;
  position: ContentToolbarPosition;
  preferencesReady: boolean;
  savedPosition: ContentToolbarPosition | null;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  setPosition: Dispatch<SetStateAction<ContentToolbarPosition>>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  dragOffset: RefObject<ContentToolbarPosition>;
  uiScale: number;
}) {
  const isInitialized = useToolbarPositionInitialization({
    preferencesReady: args.preferencesReady,
    savedPosition: args.savedPosition,
    setPosition: args.setPosition,
    toolbarRef: args.toolbarRef,
    uiScale: args.uiScale,
  });

  useToolbarViewportClamping({
    currentViewport: args.currentViewport,
    displayMode: args.displayMode,
    isInitialized,
    setPosition: args.setPosition,
    toolbarRef: args.toolbarRef,
    uiScale: args.uiScale,
  });
  useToolbarPreferencePersistence({
    compactMenus: args.compactMenus,
    displayMode: args.displayMode,
    isInitialized,
    position: args.position,
    preferencesReady: args.preferencesReady,
  });
  useToolbarDragListeners({
    dragOffset: args.dragOffset,
    isDragging: args.isDragging,
    setPosition: args.setPosition,
    stopDragging: () => args.setIsDragging(false),
    toolbarRef: args.toolbarRef,
    uiScale: args.uiScale,
  });

  return isInitialized;
}

export function useToolbarDragPosition(
  currentViewport: { width: number; height: number } | null
): ToolbarDragPositionState {
  const [position, setPosition] = useState<ContentToolbarPosition>({
    x: 0,
    y: DEFAULT_TOOLBAR_TOP,
  });
  const uiScale = useContentUiScale();
  const { dragOffset, handleMouseDown, isDragging, setIsDragging, toolbarRef } =
    useToolbarDragController(position, uiScale);
  const {
    compactMenus,
    displayMode,
    preferencesReady,
    savedPosition,
    setCompactMenus,
    setDisplayMode,
  } = useToolbarPreferencesState();

  const positionReady = useToolbarPreferenceLifecycle({
    compactMenus,
    currentViewport,
    displayMode,
    dragOffset,
    isDragging,
    position,
    preferencesReady,
    savedPosition,
    setIsDragging,
    setPosition,
    toolbarRef,
    uiScale,
  });

  return {
    compactMenus,
    displayMode,
    handleMouseDown,
    isDragging,
    position,
    positionReady,
    setCompactMenus,
    setDisplayMode,
    toolbarRef,
  };
}
