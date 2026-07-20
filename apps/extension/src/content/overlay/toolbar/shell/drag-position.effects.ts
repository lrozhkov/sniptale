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

const DEFAULT_TOOLBAR_TOP = 5;
const TOOLBAR_POSITION_PERSIST_DELAY_MS = 150;
const PASSIVE_MOUSE_LISTENER_OPTIONS: AddEventListenerOptions = { passive: true };

const logger = createLogger({ namespace: 'ContentToolbarDragPosition' });

function resolveDefaultToolbarPosition(toolbarEl: HTMLElement): ContentToolbarPosition {
  return {
    x: Math.max(0, (window.innerWidth - toolbarEl.offsetWidth) / 2),
    y: DEFAULT_TOOLBAR_TOP,
  };
}

function clampToolbarPosition(
  position: ContentToolbarPosition,
  toolbarEl: HTMLElement
): ContentToolbarPosition {
  const maxX = Math.max(0, window.innerWidth - toolbarEl.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - toolbarEl.offsetHeight);

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
}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const { preferencesReady, savedPosition, setPosition, toolbarRef } = params;

  useLayoutEffect(() => {
    if (isInitialized || !preferencesReady || !toolbarRef.current) {
      return;
    }

    const initialPosition = savedPosition ?? resolveDefaultToolbarPosition(toolbarRef.current);
    setPosition(clampToolbarPosition(initialPosition, toolbarRef.current));
    setIsInitialized(true);
  }, [isInitialized, preferencesReady, savedPosition, setPosition, toolbarRef]);

  return isInitialized;
}

export function useToolbarViewportClamping(params: {
  currentViewport: { width: number; height: number } | null;
  displayMode: ContentToolbarDisplayMode;
  isInitialized: boolean;
  setPosition: Dispatch<SetStateAction<ContentToolbarPosition>>;
  toolbarRef: RefObject<HTMLDivElement | null>;
}) {
  const { currentViewport, displayMode, isInitialized, setPosition, toolbarRef } = params;

  useEffect(() => {
    if (!isInitialized || !toolbarRef.current) {
      return;
    }

    setPosition((previous) => clampToolbarPosition(previous, toolbarRef.current!));
  }, [currentViewport, displayMode, isInitialized, setPosition, toolbarRef]);

  useEffect(() => {
    if (!isInitialized || !toolbarRef.current) {
      return;
    }

    const syncClampedPosition = () => {
      if (!toolbarRef.current) {
        return;
      }

      setPosition((previous) => clampToolbarPosition(previous, toolbarRef.current!));
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
  }, [displayMode, isInitialized, setPosition, toolbarRef]);
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
}) {
  const { dragOffset, isDragging, setPosition, stopDragging, toolbarRef } = params;

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!toolbarRef.current) {
        return;
      }

      const nextPosition = {
        x: event.clientX - (dragOffset.current?.x ?? 0),
        y: event.clientY - (dragOffset.current?.y ?? 0),
      };

      setPosition(clampToolbarPosition(nextPosition, toolbarRef.current));
    };

    window.addEventListener('mousemove', handleMouseMove, PASSIVE_MOUSE_LISTENER_OPTIONS);
    window.addEventListener('mouseup', stopDragging, PASSIVE_MOUSE_LISTENER_OPTIONS);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, PASSIVE_MOUSE_LISTENER_OPTIONS);
      window.removeEventListener('mouseup', stopDragging, PASSIVE_MOUSE_LISTENER_OPTIONS);
    };
  }, [dragOffset, isDragging, setPosition, stopDragging, toolbarRef]);
}
