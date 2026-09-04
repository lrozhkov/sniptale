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
  ContentToolbarPosition,
} from '../../../../contracts/settings';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { resolveContentUiViewport } from '@sniptale/ui/floating-interactions/scale';

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
  uiScale: number
): ContentToolbarPosition {
  const viewport = resolveContentUiViewport({
    clientHeight: window.innerHeight,
    clientWidth: window.innerWidth,
    scale: uiScale,
  });
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
    compactMenus,
    displayMode,
    preferencesReady,
    savedPosition,
    setCompactMenus,
    setDisplayMode,
  };
}

export function useToolbarPositionInitialization(params: {
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
    setPosition(clampToolbarPosition(initialPosition, toolbarRef.current, params.uiScale));
    setIsInitialized(true);
  }, [isInitialized, params.uiScale, preferencesReady, savedPosition, setPosition, toolbarRef]);

  return isInitialized;
}

export function useToolbarViewportClamping(params: {
  currentViewport: { width: number; height: number } | null;
  displayMode: ContentToolbarDisplayMode;
  isInitialized: boolean;
  setPosition: Dispatch<SetStateAction<ContentToolbarPosition>>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  uiScale: number;
}) {
  const { currentViewport, displayMode, isInitialized, setPosition, toolbarRef } = params;

  useEffect(() => {
    if (!isInitialized || !toolbarRef.current) {
      return;
    }

    setPosition((previous) => clampToolbarPosition(previous, toolbarRef.current!, params.uiScale));
  }, [currentViewport, displayMode, isInitialized, params.uiScale, setPosition, toolbarRef]);

  useEffect(() => {
    if (!isInitialized || !toolbarRef.current) {
      return;
    }

    const syncClampedPosition = () => {
      if (!toolbarRef.current) {
        return;
      }

      setPosition((previous) =>
        clampToolbarPosition(previous, toolbarRef.current!, params.uiScale)
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
  }, [displayMode, isInitialized, params.uiScale, setPosition, toolbarRef]);
}

export function useToolbarPreferencePersistence(params: {
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  isInitialized: boolean;
  position: ContentToolbarPosition;
  preferencesReady: boolean;
}) {
  const { compactMenus, displayMode, isInitialized, position, preferencesReady } = params;

  useEffect(() => {
    if (!preferencesReady || !isInitialized) {
      return;
    }

    const timer = window.setTimeout(() => {
      patchSettings({
        contentToolbar: {
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
  }, [compactMenus, displayMode, isInitialized, position, preferencesReady]);
}

export function useToolbarDragListeners(params: {
  dragOffset: RefObject<ContentToolbarPosition>;
  isDragging: boolean;
  setPosition: Dispatch<SetStateAction<ContentToolbarPosition>>;
  stopDragging: () => void;
  toolbarRef: RefObject<HTMLDivElement | null>;
  uiScale: number;
}) {
  const { dragOffset, isDragging, setPosition, stopDragging, toolbarRef } = params;

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!toolbarRef.current) {
        return;
      }

      const nextPosition = {
        x: event.clientX / params.uiScale - (dragOffset.current?.x ?? 0),
        y: event.clientY / params.uiScale - (dragOffset.current?.y ?? 0),
      };

      setPosition(clampToolbarPosition(nextPosition, toolbarRef.current, params.uiScale));
    };

    window.addEventListener('pointermove', handlePointerMove, PASSIVE_POINTER_LISTENER_OPTIONS);
    window.addEventListener('pointerup', stopDragging, PASSIVE_POINTER_LISTENER_OPTIONS);
    window.addEventListener('pointercancel', stopDragging, PASSIVE_POINTER_LISTENER_OPTIONS);

    return () => {
      window.removeEventListener(
        'pointermove',
        handlePointerMove,
        PASSIVE_POINTER_LISTENER_OPTIONS
      );
      window.removeEventListener('pointerup', stopDragging, PASSIVE_POINTER_LISTENER_OPTIONS);
      window.removeEventListener('pointercancel', stopDragging, PASSIVE_POINTER_LISTENER_OPTIONS);
    };
  }, [dragOffset, isDragging, params.uiScale, setPosition, stopDragging, toolbarRef]);
}
