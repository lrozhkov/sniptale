import { useEffect, useRef, useState } from 'react';

import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import type { BrowserStorageChanges } from '@sniptale/platform/browser/storage-types';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  HIGHLIGHTER_SETTINGS_KEY,
  loadHighlighterSettings,
} from '../../../../composition/persistence/highlighter';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import {
  createHighlighterSettingsPersistenceSession,
  syncHighlighterSettingsSnapshot,
  type HighlighterSettingsPersistenceSession,
} from './persistence';

const logger = createLogger({ namespace: 'SettingsHighlighter' });
const HIGHLIGHTER_SETTINGS_CHANGED_EVENT = 'sniptale-highlighter-settings-changed';

function reportHighlighterSettingsLoadFailure(error: unknown) {
  logger.error('Failed to load highlighter settings', error);
  toast.error(
    `${translate('common.states.error')}${translate('highlighter.section.loadErrorSuffix')}`
  );
}

function hasHighlighterSettingsSyncChange(
  changes: BrowserStorageChanges,
  areaName: chrome.storage.AreaName
) {
  return areaName === 'sync' && Boolean(changes[HIGHLIGHTER_SETTINGS_KEY]);
}

function isLatestHighlighterSettingsSyncRequest(args: {
  isCancelled: () => boolean;
  latestSyncRequestIdRef: { current: number };
  requestId: number;
}) {
  return !args.isCancelled() && args.requestId === args.latestSyncRequestIdRef.current;
}

function createHighlighterSettingsSyncHandler(args: {
  isCancelled: () => boolean;
  latestSyncRequestIdRef: { current: number };
  settingsPersistenceSession: HighlighterSettingsPersistenceSession;
  setIsLoading: (value: boolean) => void;
  setSettings: (value: HighlighterSettings | null) => void;
}) {
  return async ({ reportError }: { reportError: boolean }) => {
    const requestId = args.latestSyncRequestIdRef.current + 1;
    args.latestSyncRequestIdRef.current = requestId;

    try {
      const loadedSettings = await loadHighlighterSettings();
      if (!isLatestHighlighterSettingsSyncRequest({ requestId, ...args })) {
        return;
      }

      syncHighlighterSettingsSnapshot(args.settingsPersistenceSession, loadedSettings);
      args.setSettings(loadedSettings);
      args.setIsLoading(false);
    } catch (error) {
      if (!isLatestHighlighterSettingsSyncRequest({ requestId, ...args })) {
        return;
      }

      if (reportError) {
        reportHighlighterSettingsLoadFailure(error);
        return;
      }

      logger.error('Failed to synchronize highlighter settings', error);
    } finally {
      if (isLatestHighlighterSettingsSyncRequest({ requestId, ...args })) {
        args.setIsLoading(false);
      }
    }
  };
}

function useHighlighterSettingsStorageSync({
  setIsLoading,
  setSettings,
  settingsPersistenceSession,
}: {
  settingsPersistenceSession: HighlighterSettingsPersistenceSession;
  setIsLoading: (value: boolean) => void;
  setSettings: (value: HighlighterSettings | null) => void;
}) {
  const latestSyncRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const syncSettingsFromStorage = createHighlighterSettingsSyncHandler({
      isCancelled: () => cancelled,
      latestSyncRequestIdRef,
      settingsPersistenceSession,
      setIsLoading,
      setSettings,
    });

    void syncSettingsFromStorage({ reportError: true });

    const handleSettingsChanged = () => {
      void syncSettingsFromStorage({ reportError: false });
    };
    const handleStorageChanged = (
      changes: BrowserStorageChanges,
      areaName: chrome.storage.AreaName
    ) => {
      if (hasHighlighterSettingsSyncChange(changes, areaName)) {
        handleSettingsChanged();
      }
    };
    const unsubscribeFromStorageChanges = browserStorage.subscribeToChanges(handleStorageChanged);

    window.addEventListener(HIGHLIGHTER_SETTINGS_CHANGED_EVENT, handleSettingsChanged);

    return () => {
      cancelled = true;
      unsubscribeFromStorageChanges();
      window.removeEventListener(HIGHLIGHTER_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    };
  }, [setIsLoading, setSettings, settingsPersistenceSession]);
}

export function useHighlighterSectionState() {
  const settingsPersistenceSessionRef = useRef(createHighlighterSettingsPersistenceSession());
  const [settings, setSettings] = useState<HighlighterSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<BorderPreset | undefined>(undefined);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useHighlighterSettingsStorageSync({
    settingsPersistenceSession: settingsPersistenceSessionRef.current,
    setIsLoading,
    setSettings,
  });

  return {
    draggedId,
    dragOverId,
    editingPreset,
    hoveredPresetId,
    isEditorOpen,
    isLoading,
    settingsPersistenceSession: settingsPersistenceSessionRef.current,
    setDraggedId,
    setDragOverId,
    setEditingPreset,
    setHoveredPresetId,
    setIsEditorOpen,
    setSettings,
    settings,
  };
}
