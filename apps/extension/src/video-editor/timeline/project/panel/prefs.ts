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
  setPanelExpanded: (expanded: boolean) => void;
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
    cursorLaneVisible: prefs.panelExpanded || prefs.collapsedCursorLaneVisible,
    prefs,
    telemetryLaneVisible: prefs.panelExpanded || prefs.collapsedTelemetryLaneVisible,
    ...actions,
  };
}

function useCurrentTrackIds(project: VideoProject): ReadonlySet<string> {
  const trackIdsKey = project.tracks.map((track) => track.id).join('\n');
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
    setPanelExpanded: useTrackPanelBooleanSetter(updatePrefs, 'panelExpanded'),
    setTrackHeight: useTrackHeightSetter(updatePrefs),
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
    | 'panelExpanded'
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
    trackHeightByTrackId: Object.fromEntries(
      Object.entries(prefs.trackHeightByTrackId).filter(([trackId]) => currentTrackIds.has(trackId))
    ),
  };
}
