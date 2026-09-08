import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS,
  loadVideoEditorTrackPanelPrefs,
  saveVideoEditorTrackPanelPrefs,
  type VideoEditorTrackHeightMultiplier,
  type VideoEditorTrackPanelPrefs,
} from '../../../persistence/track-panel';
import type { VideoProject } from '../../../../features/video/project/types';

interface ProjectTimelinePanelPrefsState {
  cursorLaneVisible: boolean;
  prefs: VideoEditorTrackPanelPrefs;
  telemetryLaneVisible: boolean;
  setCollapsedCursorLaneVisible: (visible: boolean) => void;
  setCollapsedTelemetryLaneVisible: (visible: boolean) => void;
  setCompactRows: (compactRows: boolean) => void;
  setHideTrackNames: (hidden: boolean) => void;
  setClipNamesHidden: (trackId: string, hidden: boolean) => void;
  setTrackHeight: (trackId: string, multiplier: VideoEditorTrackHeightMultiplier) => void;
}

export function useProjectTimelinePanelPrefs(
  project: VideoProject
): ProjectTimelinePanelPrefsState {
  const [prefs, setPrefs] = useState<VideoEditorTrackPanelPrefs>(
    DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS
  );
  const prefsRevisionRef = useRef(0);
  const currentTrackIds = useCurrentTrackIds(project);
  useLoadTrackPanelPrefs(project.id, currentTrackIds, prefsRevisionRef, setPrefs);
  const actions = useTrackPanelPrefsActions(
    project.id,
    currentTrackIds,
    prefsRevisionRef,
    setPrefs
  );

  return {
    cursorLaneVisible:
      (project.cursorTrack?.samples.length ?? 0) > 0 &&
      prefs.collapsedTelemetryLaneVisible &&
      prefs.collapsedCursorLaneVisible,
    prefs,
    telemetryLaneVisible: prefs.collapsedTelemetryLaneVisible,
    ...actions,
  };
}

function useCurrentTrackIds(project: VideoProject): ReadonlySet<string> {
  const trackIdsKey = project.tracks
    .map((track) => track.id)
    .sort()
    .join('\n');
  return useMemo(() => new Set(trackIdsKey === '' ? [] : trackIdsKey.split('\n')), [trackIdsKey]);
}

function useLoadTrackPanelPrefs(
  projectId: string,
  currentTrackIds: ReadonlySet<string>,
  prefsRevisionRef: MutableRefObject<number>,
  setPrefs: Dispatch<SetStateAction<VideoEditorTrackPanelPrefs>>
): void {
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = loadTokenRef.current + 1;
    loadTokenRef.current = loadToken;
    prefsRevisionRef.current = 0;
    setPrefs(DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS);

    void loadVideoEditorTrackPanelPrefs(projectId, currentTrackIds).then((loadedPrefs) => {
      if (loadTokenRef.current === loadToken && prefsRevisionRef.current === 0) {
        setPrefs(loadedPrefs);
      }
    });
  }, [currentTrackIds, prefsRevisionRef, projectId, setPrefs]);
}

function useTrackPanelPrefsActions(
  projectId: string,
  currentTrackIds: ReadonlySet<string>,
  prefsRevisionRef: MutableRefObject<number>,
  setPrefs: Dispatch<SetStateAction<VideoEditorTrackPanelPrefs>>
) {
  const updatePrefs = useTrackPanelPrefsUpdater(
    projectId,
    currentTrackIds,
    prefsRevisionRef,
    setPrefs
  );

  return {
    setCollapsedCursorLaneVisible: useTrackPanelBooleanSetter(
      updatePrefs,
      'collapsedCursorLaneVisible'
    ),
    setCollapsedTelemetryLaneVisible: useTrackPanelBooleanSetter(
      updatePrefs,
      'collapsedTelemetryLaneVisible'
    ),
    setCompactRows: useTrackPanelBooleanSetter(updatePrefs, 'compactRows'),
    setHideTrackNames: useTrackPanelBooleanSetter(updatePrefs, 'hideTrackNames'),
    setTrackHeight: useTrackHeightSetter(updatePrefs),
    setClipNamesHidden: useCallback(
      (trackId: string, hidden: boolean) =>
        updatePrefs((current) => ({
          ...current,
          hiddenClipNamesByTrackId: { ...current.hiddenClipNamesByTrackId, [trackId]: hidden },
        })),
      [updatePrefs]
    ),
  };
}

function useTrackPanelPrefsUpdater(
  projectId: string,
  currentTrackIds: ReadonlySet<string>,
  prefsRevisionRef: MutableRefObject<number>,
  setPrefs: Dispatch<SetStateAction<VideoEditorTrackPanelPrefs>>
) {
  return useCallback(
    (updater: (currentPrefs: VideoEditorTrackPanelPrefs) => VideoEditorTrackPanelPrefs) => {
      setPrefs((currentPrefs) => {
        prefsRevisionRef.current += 1;
        const nextPrefs = pruneTrackPanelPrefs(updater(currentPrefs), currentTrackIds);
        void saveVideoEditorTrackPanelPrefs(projectId, nextPrefs);
        return nextPrefs;
      });
    },
    [currentTrackIds, prefsRevisionRef, projectId, setPrefs]
  );
}

function useTrackPanelBooleanSetter(
  updatePrefs: (
    updater: (currentPrefs: VideoEditorTrackPanelPrefs) => VideoEditorTrackPanelPrefs
  ) => void,
  key:
    | 'collapsedCursorLaneVisible'
    | 'collapsedTelemetryLaneVisible'
    | 'compactRows'
    | 'hideTrackNames'
) {
  return useCallback(
    (visible: boolean) => updatePrefs((currentPrefs) => ({ ...currentPrefs, [key]: visible })),
    [key, updatePrefs]
  );
}

function useTrackHeightSetter(
  updatePrefs: (
    updater: (currentPrefs: VideoEditorTrackPanelPrefs) => VideoEditorTrackPanelPrefs
  ) => void
) {
  return useCallback(
    (trackId: string, multiplier: VideoEditorTrackHeightMultiplier) =>
      updatePrefs((currentPrefs) => ({
        ...currentPrefs,
        trackHeightByTrackId: {
          ...currentPrefs.trackHeightByTrackId,
          [trackId]: multiplier,
        },
      })),
    [updatePrefs]
  );
}

function pruneTrackPanelPrefs(
  prefs: VideoEditorTrackPanelPrefs,
  currentTrackIds: ReadonlySet<string>
): VideoEditorTrackPanelPrefs {
  return {
    ...prefs,
    ...(prefs.hiddenClipNamesByTrackId
      ? {
          hiddenClipNamesByTrackId: Object.fromEntries(
            Object.entries(prefs.hiddenClipNamesByTrackId).filter(([id]) => currentTrackIds.has(id))
          ),
        }
      : {}),
    trackHeightByTrackId: Object.fromEntries(
      Object.entries(prefs.trackHeightByTrackId).filter(([trackId]) => currentTrackIds.has(trackId))
    ),
  };
}
