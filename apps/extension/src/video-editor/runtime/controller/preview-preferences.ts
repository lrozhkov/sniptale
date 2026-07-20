import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

import {
  DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES,
  loadVideoEditorPreviewPreferences,
  saveVideoEditorPreviewPreferences,
  type VideoEditorPreviewPreferences,
} from '../../../composition/persistence/video-editor-preview-preferences';
import { translate } from '../../../platform/i18n';

const logger = createLogger({ namespace: 'VideoEditorPreviewPreferences' });

function usePreviewPreferenceHydration(
  localRevisionRef: MutableRefObject<number>,
  preferencesRef: MutableRefObject<VideoEditorPreviewPreferences>,
  setPreferences: Dispatch<SetStateAction<VideoEditorPreviewPreferences>>
): void {
  useEffect(() => {
    const loadRevision = localRevisionRef.current;
    let cancelled = false;
    void loadVideoEditorPreviewPreferences().then(
      (result) => {
        if (!cancelled && localRevisionRef.current === loadRevision) {
          preferencesRef.current = result.preferences;
          setPreferences(result.preferences);
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        logger.debug('Failed to load preview preferences', error);
        toast.error(translate('videoEditor.stage.previewPreferencesLoadFailure'));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [localRevisionRef, preferencesRef, setPreferences]);
}

export function useVideoEditorPreviewPreferences() {
  const [preferences, setPreferences] = useState<VideoEditorPreviewPreferences>(
    DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const localRevisionRef = useRef(0);
  const preferencesRef = useRef(preferences);

  usePreviewPreferenceHydration(localRevisionRef, preferencesRef, setPreferences);

  const persistPreferences = useCallback((next: VideoEditorPreviewPreferences) => {
    setSaveFailed(false);
    void saveVideoEditorPreviewPreferences(next).then(
      () => setSaveFailed(false),
      (error: unknown) => {
        logger.debug('Failed to save preview preferences', error);
        setSaveFailed(true);
        toast.error(translate('videoEditor.stage.previewPreferencesSaveFailure'));
      }
    );
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<VideoEditorPreviewPreferences>) => {
      localRevisionRef.current += 1;
      const next = { ...preferencesRef.current, ...patch };
      preferencesRef.current = next;
      setPreferences(next);
      persistPreferences(next);
    },
    [persistPreferences]
  );

  const retrySave = useCallback(
    () => persistPreferences(preferencesRef.current),
    [persistPreferences]
  );

  return { preferences, retrySave, saveFailed, updatePreferences };
}
