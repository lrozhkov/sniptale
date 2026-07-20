import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  isBoolean,
  isNumber,
  isRecord,
} from '../../composition/persistence/infrastructure/guards/primitives';

const TRACK_PANEL_PREFS_KEY_PREFIX = 'sniptale_video_editor_track_panel_prefs:';
const logger = createLogger({ namespace: 'SharedUiStateStorage' });

export type VideoEditorTrackHeightMultiplier = number;

export interface VideoEditorTrackPanelPrefs {
  collapsedCursorLaneVisible: boolean;
  collapsedTelemetryLaneVisible: boolean;
  compactRows: boolean;
  panelExpanded: boolean;
  trackHeightByTrackId: Record<string, VideoEditorTrackHeightMultiplier>;
}

const TRACK_PANEL_BOOLEAN_FIELDS = [
  'panelExpanded',
  'compactRows',
  'collapsedCursorLaneVisible',
  'collapsedTelemetryLaneVisible',
] as const;

export const DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS: VideoEditorTrackPanelPrefs = {
  collapsedCursorLaneVisible: true,
  collapsedTelemetryLaneVisible: false,
  compactRows: false,
  panelExpanded: false,
  trackHeightByTrackId: {},
};

function parseStoredTrackPanelPrefs(
  value: unknown,
  currentTrackIds: ReadonlySet<string>
): {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  staleTrackIdCount: number;
  value: Partial<VideoEditorTrackPanelPrefs>;
} {
  if (value === undefined) {
    return { hasInvalidRoot: false, invalidFieldCount: 0, staleTrackIdCount: 0, value: {} };
  }
  if (!isRecord(value)) {
    return { hasInvalidRoot: true, invalidFieldCount: 0, staleTrackIdCount: 0, value: {} };
  }

  const parsed: Partial<VideoEditorTrackPanelPrefs> = {};
  let invalidFieldCount = 0;
  for (const field of TRACK_PANEL_BOOLEAN_FIELDS) {
    if (isBoolean(value[field])) parsed[field] = value[field];
    else if (value[field] !== undefined) invalidFieldCount += 1;
  }
  const heights = parseTrackHeights(value['trackHeightByTrackId'], currentTrackIds);
  if (value['trackHeightByTrackId'] !== undefined) parsed.trackHeightByTrackId = heights.value;
  return {
    hasInvalidRoot: false,
    invalidFieldCount: invalidFieldCount + heights.invalidFieldCount,
    staleTrackIdCount: heights.staleTrackIdCount,
    value: parsed,
  };
}

function parseTrackHeights(value: unknown, currentTrackIds: ReadonlySet<string>) {
  if (value === undefined) return { invalidFieldCount: 0, staleTrackIdCount: 0, value: {} };
  if (!isRecord(value)) return { invalidFieldCount: 1, staleTrackIdCount: 0, value: {} };

  const parsed: Record<string, number> = {};
  let invalidFieldCount = 0;
  let staleTrackIdCount = 0;
  for (const [trackId, multiplier] of Object.entries(value)) {
    if (!currentTrackIds.has(trackId)) {
      staleTrackIdCount += 1;
    } else if (!isNumber(multiplier) || multiplier < 0.5 || multiplier > 3) {
      invalidFieldCount += 1;
    } else {
      parsed[trackId] = Math.round(multiplier / 0.25) * 0.25;
    }
  }
  return { invalidFieldCount, staleTrackIdCount, value: parsed };
}

function getTrackPanelPrefsStorageKey(projectId: string): string {
  return `${TRACK_PANEL_PREFS_KEY_PREFIX}${projectId}`;
}

function mergeTrackPanelPrefs(
  value: Partial<VideoEditorTrackPanelPrefs>
): VideoEditorTrackPanelPrefs {
  return {
    ...DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS,
    ...value,
    trackHeightByTrackId: value.trackHeightByTrackId ?? {},
  };
}

function warnAboutTrackPanelPrefs(params: {
  hasInvalidRoot: boolean;
  invalidFieldCount: number;
  projectId: string;
  staleTrackIdCount: number;
}): void {
  if (params.hasInvalidRoot) {
    logger.warn('Ignoring invalid video editor track panel prefs root from storage', {
      projectId: params.projectId,
    });
  }

  if (params.invalidFieldCount > 0 || params.staleTrackIdCount > 0) {
    logger.warn('Dropped invalid video editor track panel prefs fields from storage', {
      invalidFieldCount: params.invalidFieldCount,
      projectId: params.projectId,
      staleTrackIdCount: params.staleTrackIdCount,
    });
  }
}

export async function loadVideoEditorTrackPanelPrefs(
  projectId: string,
  currentTrackIds: ReadonlySet<string>
): Promise<VideoEditorTrackPanelPrefs> {
  const storageKey = getTrackPanelPrefsStorageKey(projectId);

  try {
    const result = await browserStorage.local.get([storageKey]);
    const parsedPrefs = parseStoredTrackPanelPrefs(result[storageKey], currentTrackIds);

    warnAboutTrackPanelPrefs({ ...parsedPrefs, projectId });

    return mergeTrackPanelPrefs(parsedPrefs.value);
  } catch {
    return DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS;
  }
}

export async function saveVideoEditorTrackPanelPrefs(
  projectId: string,
  prefs: VideoEditorTrackPanelPrefs
): Promise<void> {
  try {
    await browserStorage.local.set({
      [getTrackPanelPrefsStorageKey(projectId)]: prefs,
    });
  } catch (error) {
    logger.warn('Failed to save video editor track panel prefs', { projectId, error });
  }
}
