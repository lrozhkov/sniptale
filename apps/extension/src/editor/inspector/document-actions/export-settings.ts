import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { isBrowserClipboardImageFormatSupported } from '@sniptale/platform/browser/clipboard';
import { translate } from '../../../platform/i18n';
import {
  loadEditorExportSettings,
  patchEditorExportSettings,
} from '../../persistence/export-settings';
import type { EditorExportSettings } from '../../persistence/export-settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  dispatchEditorExportSettingsChanged,
  EDITOR_EXPORT_SETTINGS_CHANGED_EVENT,
  readEditorExportSettingsChangedEvent,
} from './export-settings-events';
import { loadPersistedEditorSettings, syncLoadedSettings } from './settings';

type EditorImageFormat = EditorExportSettings['imageFormat'];
type ExportSettingsPatch = Partial<EditorExportSettings>;
type QualityPersistState = {
  promise: Promise<void>;
  value: number;
} | null;

const QUALITY_COMMIT_ERROR = 'Failed to persist editor export settings';

interface LoadEditorExportSettingsArgs {
  committedQualityRef: MutableRefObject<number>;
  qualityPersistStateRef: MutableRefObject<QualityPersistState>;
  setImageFormat: Dispatch<SetStateAction<EditorImageFormat>>;
  setImageQuality: Dispatch<SetStateAction<number>>;
  settingsRef: MutableRefObject<EditorExportSettings | null>;
  visibleQualityRef: MutableRefObject<number>;
}

function useLoadEditorExportSettings(args: LoadEditorExportSettingsArgs) {
  useEffect(() => {
    let cancelled = false;
    const syncSettings = (settings: EditorExportSettings) => {
      syncLoadedSettings(settings, args.setImageFormat, args.setImageQuality, args.settingsRef);
      args.visibleQualityRef.current = settings.imageQuality;
      args.committedQualityRef.current = settings.imageQuality;
      args.qualityPersistStateRef.current = null;
    };
    const handleSettingsChanged = (event: Event) => {
      const settings = readEditorExportSettingsChangedEvent(event);

      if (settings) {
        syncSettings(settings);
      }
    };

    window.addEventListener(EDITOR_EXPORT_SETTINGS_CHANGED_EVENT, handleSettingsChanged);

    void loadEditorExportSettings()
      .then((settings) => {
        if (!cancelled) {
          syncSettings(settings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          args.settingsRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener(EDITOR_EXPORT_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    };
  }, [
    args.committedQualityRef,
    args.qualityPersistStateRef,
    args.setImageFormat,
    args.setImageQuality,
    args.settingsRef,
    args.visibleQualityRef,
  ]);
}

function createPersistFailureMessage(error: unknown) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : translate('common.states.error');
}

function useExportSettingFailureState() {
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistErrorMessage, setPersistErrorMessage] = useState<string | null>(null);

  return {
    isPersisting,
    persistErrorMessage,
    startPersist: () => {
      setPersistErrorMessage(null);
      setIsPersisting(true);
    },
    finishPersist: () => {
      setIsPersisting(false);
    },
    clearPersistFailure: () => {
      setPersistErrorMessage(null);
    },
    handlePersistFailure: (error: unknown) => {
      const message = createPersistFailureMessage(error);
      setPersistErrorMessage(message);
      toast.error(message);
    },
  };
}

function createPersistPatch(settingsRef: MutableRefObject<EditorExportSettings | null>) {
  return async (patch: ExportSettingsPatch) => {
    const currentSettings = await loadPersistedEditorSettings(
      settingsRef.current,
      loadEditorExportSettings
    );

    try {
      return await patchEditorExportSettings(patch);
    } catch (error) {
      settingsRef.current = currentSettings;
      throw error instanceof Error ? error : new Error(QUALITY_COMMIT_ERROR);
    }
  };
}

function createImageQualityCommitHandler(args: {
  committedQualityRef: MutableRefObject<number>;
  persistPatch: (patch: ExportSettingsPatch) => Promise<EditorExportSettings>;
  persistState: ReturnType<typeof useExportSettingFailureState>;
  qualityPersistStateRef: MutableRefObject<QualityPersistState>;
  settingsRef: MutableRefObject<EditorExportSettings | null>;
  syncImageQualityDraft: (nextQuality: number) => void;
  visibleQualityRef: MutableRefObject<number>;
}) {
  return async () => {
    const draftQuality = args.visibleQualityRef.current;
    const inFlightState = args.qualityPersistStateRef.current;

    if (inFlightState?.value === draftQuality) {
      return inFlightState.promise;
    }

    if (draftQuality === args.committedQualityRef.current && inFlightState === null) {
      return;
    }

    args.persistState.clearPersistFailure();
    const commitPromise = args
      .persistPatch({ imageQuality: draftQuality })
      .then((persistedSettings) => {
        args.settingsRef.current = persistedSettings;
        args.committedQualityRef.current = persistedSettings.imageQuality;
        dispatchEditorExportSettingsChanged(persistedSettings);
      })
      .catch((error) => {
        if (args.visibleQualityRef.current === draftQuality) {
          args.syncImageQualityDraft(args.committedQualityRef.current);
        }

        args.persistState.handlePersistFailure(error);
      })
      .finally(() => {
        if (args.qualityPersistStateRef.current?.value === draftQuality) {
          args.qualityPersistStateRef.current = null;
        }
      });

    args.qualityPersistStateRef.current = {
      promise: commitPromise,
      value: draftQuality,
    };

    return commitPromise;
  };
}

function useImageQualityDraftState(args: {
  persistPatch: (patch: ExportSettingsPatch) => Promise<EditorExportSettings>;
  persistState: ReturnType<typeof useExportSettingFailureState>;
  settingsRef: MutableRefObject<EditorExportSettings | null>;
}) {
  const [imageQuality, setImageQuality] = useState(100);
  const committedQualityRef = useRef(imageQuality);
  const visibleQualityRef = useRef(imageQuality);
  const qualityPersistStateRef = useRef<QualityPersistState>(null);

  const syncImageQualityDraft = (nextQuality: number) => {
    visibleQualityRef.current = nextQuality;
    setImageQuality(nextQuality);
  };

  const commitImageQuality = createImageQualityCommitHandler({
    committedQualityRef,
    persistPatch: args.persistPatch,
    persistState: args.persistState,
    qualityPersistStateRef,
    settingsRef: args.settingsRef,
    syncImageQualityDraft,
    visibleQualityRef,
  });

  return {
    imageQuality,
    qualityPersistStateRef,
    setImageQuality: syncImageQualityDraft,
    setImageQualityState: setImageQuality,
    syncImageQualityDraft,
    visibleQualityRef,
    commitImageQuality,
    committedQualityRef,
  };
}

function createImageFormatPersistenceHandler(args: {
  imageFormat: EditorImageFormat;
  persistPatch: (patch: ExportSettingsPatch) => Promise<EditorExportSettings>;
  persistState: ReturnType<typeof useExportSettingFailureState>;
  setImageFormat: Dispatch<SetStateAction<EditorImageFormat>>;
  settingsRef: MutableRefObject<EditorExportSettings | null>;
}) {
  return async (nextFormat: EditorImageFormat) => {
    const previousFormat = args.imageFormat;

    args.persistState.startPersist();
    args.setImageFormat(nextFormat);

    try {
      args.settingsRef.current = await args.persistPatch({ imageFormat: nextFormat });
      dispatchEditorExportSettingsChanged(args.settingsRef.current);
    } catch (error) {
      args.setImageFormat(previousFormat);
      args.persistState.handlePersistFailure(error);
    } finally {
      args.persistState.finishPersist();
    }
  };
}

export function useEditorExportSettingsState() {
  const settingsRef = useRef<EditorExportSettings | null>(null);
  const [imageFormat, setImageFormat] = useState<EditorImageFormat>('png');
  const persistState = useExportSettingFailureState();
  const persistPatch = createPersistPatch(settingsRef);
  const qualityState = useImageQualityDraftState({
    persistPatch,
    persistState,
    settingsRef,
  });

  useLoadEditorExportSettings({
    committedQualityRef: qualityState.committedQualityRef,
    qualityPersistStateRef: qualityState.qualityPersistStateRef,
    setImageFormat,
    setImageQuality: qualityState.setImageQualityState,
    settingsRef,
    visibleQualityRef: qualityState.visibleQualityRef,
  });

  return {
    imageFormat,
    imageQuality: qualityState.imageQuality,
    isPersisting: persistState.isPersisting,
    isClipboardCopySupported: isBrowserClipboardImageFormatSupported(imageFormat),
    isQualityDisabled: imageFormat === 'png',
    persistErrorMessage: persistState.persistErrorMessage,
    setImageFormat: createImageFormatPersistenceHandler({
      imageFormat,
      persistPatch,
      persistState,
      setImageFormat,
      settingsRef,
    }),
    setImageQuality: qualityState.setImageQuality,
    commitImageQuality: qualityState.commitImageQuality,
  };
}
