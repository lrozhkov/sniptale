import {
  useEffect,
  useLayoutEffect,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type {
  ContentToolbarDisplayMode,
  ContentToolbarDockEdge,
  ContentToolbarPosition,
} from '../../../../contracts/settings';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { resolveContentUiViewport } from '@sniptale/ui/floating-interactions/scale';

import { resolveToolbarDockEdge, resolveToolbarDockPosition } from './docking';

const DEFAULT_TOOLBAR_TOP = 5;
const TOOLBAR_POSITION_PERSIST_DELAY_MS = 150;
const PASSIVE_POINTER_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

const logger = createLogger({ namespace: 'ContentToolbarDragPosition' });

function resolveDefaultToolbarPosition(
  toolbarEl: HTMLElement,
  uiScale: number
): ContentToolbarPosition {
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
  return {
    x: Math.max(0, (viewport.width - toolbarEl.offsetWidth) / 2),
    y: DEFAULT_TOOLBAR_TOP,
  };
}

function clampToolbarPosition(
  position: ContentToolbarPosition,
  toolbarEl: HTMLElement,
  uiScale: number,
  dockEdge?: ContentToolbarDockEdge
): ContentToolbarPosition {
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
  if (dockEdge)
    return resolveToolbarDockPosition(
      dockEdge,
      { width: toolbarEl.offsetWidth, height: toolbarEl.offsetHeight },
      viewport
    );
  const maxX = Math.max(0, viewport.width - toolbarEl.offsetWidth);
  const maxY = Math.max(0, viewport.height - toolbarEl.offsetHeight);

  return {
    x: Math.max(0, Math.min(position.x, maxX)),
    y: Math.max(0, Math.min(position.y, maxY)),
  };
}

export function useToolbarPreferencesState() {
  const [displayMode, setDisplayMode] = useState<ContentToolbarDisplayMode>('horizontal');
  const [compactMenus, setCompactMenus] = useState(false);
  const [freePlacement, setFreePlacement] = useState(false);
  const [dockEdge, setDockEdge] = useState<ContentToolbarDockEdge>('top');
  const [savedPosition, setSavedPosition] = useState<ContentToolbarPosition | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }

        setDisplayMode(settings.contentToolbar?.displayMode ?? 'horizontal');
        setCompactMenus(settings.contentToolbar?.compactMenus ?? false);
        setFreePlacement(settings.contentToolbar?.freePlacement ?? false);
        setDockEdge(settings.contentToolbar?.dockEdge ?? 'top');
        setSavedPosition(settings.contentToolbar?.position ?? null);
        setPreferencesReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          logger.error('Failed to load content toolbar preferences', error);
          setPreferencesReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    freePlacement,
    setFreePlacement,
    dockEdge,
    setDockEdge,
    compactMenus,
    displayMode,
    preferencesReady,
    savedPosition,
    setCompactMenus,
    setDisplayMode,
  };
}

export function useToolbarPositionInitialization(params: {
  dockEdge?: ContentToolbarDockEdge;
  preferencesReady: boolean;
  savedPosition: ContentToolbarPosition | null;
  setPosition: Dispatch<SetStateAction<ContentToolbarPosition>>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  uiScale: number;
}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const { preferencesReady, savedPosition, setPosition, toolbarRef } = params;

  useLayoutEffect(() => {
    if (isInitialized || !preferencesReady || !toolbarRef.current) {
      return;
    }

    const initialPosition =
      savedPosition ?? resolveDefaultToolbarPosition(toolbarRef.current, params.uiScale);
    setPosition(
      clampToolbarPosition(initialPosition, toolbarRef.current, params.uiScale, params.dockEdge)
    );
    setIsInitialized(true);
  }, [
    isInitialized,
    params.dockEdge,
    params.uiScale,
    preferencesReady,
    savedPosition,
    setPosition,
    toolbarRef,
  ]);

  return isInitialized;
}

function fitVerticalToolbar(toolbar: HTMLElement, uiScale: number): void {
  const sizeProperty = '--sniptale-toolbar-button-size';
  const gapProperty = '--sniptale-toolbar-gap';
  toolbar.style.removeProperty(sizeProperty);
  toolbar.style.removeProperty(gapProperty);
  if (toolbar.dataset['displayMode'] !== 'vertical') return;
  const availableHeight = window.innerHeight / uiScale - 16;
  if (toolbar.offsetHeight <= availableHeight) return;
  const buttons = [...toolbar.querySelectorAll('.sniptale-btn')].filter(
    (button) => !button.closest('.sniptale-popover-menu')
  );
  if (!buttons.length) return;
  const defaultSize = Number.parseFloat(getComputedStyle(toolbar).getPropertyValue(sizeProperty));
  if (!Number.isFinite(defaultSize)) return;
  const fittedSize = Math.max(
    24,
    Math.floor(defaultSize - (toolbar.offsetHeight - availableHeight) / buttons.length)
  );
  toolbar.style.setProperty(sizeProperty, `${fittedSize}px`);
  if (toolbar.offsetHeight > availableHeight) toolbar.style.setProperty(gapProperty, '2px');
}

export function useToolbarViewportClamping(params: {
  dockEdge?: ContentToolbarDockEdge;
  currentViewport: { width: number; height: number } | null;
  displayMode: ContentToolbarDisplayMode;
  isInitialized: boolean;
  setPosition: Dispatch<SetStateAction<ContentToolbarPosition>>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  uiScale: number;
}) {
  const { currentViewport, displayMode, isInitialized, setPosition, toolbarRef } = params;

  useLayoutEffect(() => {
    if (!isInitialized || !toolbarRef.current) {
      return;
    }

    fitVerticalToolbar(toolbarRef.current, params.uiScale);
    setPosition((previous) =>
      clampToolbarPosition(previous, toolbarRef.current!, params.uiScale, params.dockEdge)
    );
  }, [
    currentViewport,
    displayMode,
    isInitialized,
    params.dockEdge,
    params.uiScale,
    setPosition,
    toolbarRef,
  ]);

  useLayoutEffect(() => {
    if (!isInitialized || !toolbarRef.current) {
      return;
    }

    const syncClampedPosition = () => {
      if (!toolbarRef.current) {
        return;
      }

      fitVerticalToolbar(toolbarRef.current, params.uiScale);
      setPosition((previous) =>
        clampToolbarPosition(previous, toolbarRef.current!, params.uiScale, params.dockEdge)
      );
    };

    window.addEventListener('resize', syncClampedPosition);

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            syncClampedPosition();
          });

    resizeObserver?.observe(toolbarRef.current);

    return () => {
      window.removeEventListener('resize', syncClampedPosition);
      resizeObserver?.disconnect();
    };
  }, [displayMode, isInitialized, params.dockEdge, params.uiScale, setPosition, toolbarRef]);
}

export function useToolbarPreferencePersistence(params: {
  freePlacement?: boolean;
  dockEdge?: ContentToolbarDockEdge;
  isDragging?: boolean;
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  isInitialized: boolean;
  position: ContentToolbarPosition;
  preferencesReady: boolean;
}) {
  const { compactMenus, displayMode, isInitialized, position, preferencesReady } = params;

  useEffect(() => {
    if (!preferencesReady || !isInitialized || params.isDragging) {
      return;
    }

    const timer = window.setTimeout(() => {
      patchSettings({
        contentToolbar: {
          ...(params.freePlacement === undefined ? {} : { freePlacement: params.freePlacement }),
          ...(params.dockEdge === undefined ? {} : { dockEdge: params.dockEdge }),
          compactMenus,
          displayMode,
          position,
        },
      }).catch((error) => {
        logger.error('Failed to persist content toolbar preferences', error);
      });
    }, TOOLBAR_POSITION_PERSIST_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    compactMenus,
    displayMode,
    isInitialized,
    position,
    preferencesReady,
    params.freePlacement,
    params.dockEdge,
    params.isDragging,
  ]);
}

export function useToolbarDragListeners(params: {
  freePlacement: boolean;
  setPreviewEdge: Dispatch<SetStateAction<ContentToolbarDockEdge | null>>;
  setDockEdge: Dispatch<SetStateAction<ContentToolbarDockEdge>>;
  dragOffset: RefObject<ContentToolbarPosition>;
  isDragging: boolean;
  setPosition: Dispatch<SetStateAction<ContentToolbarPosition>>;
  stopDragging: () => void;
  toolbarRef: RefObject<HTMLDivElement | null>;
  uiScale: number;
}) {
  const {
    dragOffset,
    isDragging,
    setPosition,
    stopDragging,
    toolbarRef,
    uiScale,
    freePlacement,
    setDockEdge,
    setPreviewEdge,
  } = params;

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    let candidate: ContentToolbarDockEdge | null = null;
    const finish = () => {
      if (!freePlacement && candidate) setDockEdge(candidate);
      cancel();
    };
    const cancel = () => {
      setPreviewEdge(null);
      stopDragging();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!freePlacement) {
        candidate = resolveToolbarDockEdge(
          { x: event.clientX / uiScale, y: event.clientY / uiScale },
          resolveContentUiViewport({
            clientWidth: window.innerWidth,
            clientHeight: window.innerHeight,
            scale: uiScale,
          })
        );
        setPreviewEdge(candidate);
      }
      if (!toolbarRef.current) {
        return;
      }

      const nextPosition = {
        x: event.clientX / uiScale - (dragOffset.current?.x ?? 0),
        y: event.clientY / uiScale - (dragOffset.current?.y ?? 0),
      };

      setPosition(clampToolbarPosition(nextPosition, toolbarRef.current, uiScale));
    };

    window.addEventListener('pointermove', handlePointerMove, PASSIVE_POINTER_LISTENER_OPTIONS);
    window.addEventListener('pointerup', finish, PASSIVE_POINTER_LISTENER_OPTIONS);
    window.addEventListener('pointercancel', cancel, PASSIVE_POINTER_LISTENER_OPTIONS);

    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener(
        'pointermove',
        handlePointerMove,
        PASSIVE_POINTER_LISTENER_OPTIONS
      );
      window.removeEventListener('pointerup', finish, PASSIVE_POINTER_LISTENER_OPTIONS);
      window.removeEventListener('pointercancel', cancel, PASSIVE_POINTER_LISTENER_OPTIONS);
    };
  }, [
    dragOffset,
    isDragging,
    uiScale,
    freePlacement,
    setDockEdge,
    setPreviewEdge,
    setPosition,
    stopDragging,
    toolbarRef,
  ]);
}
