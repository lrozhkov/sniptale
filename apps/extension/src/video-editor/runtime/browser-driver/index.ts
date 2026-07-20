import { buildVideoEditorUrl } from '../app-model/utils';

/**
 * Owns browser-history mutations for the video editor workspace.
 */
export function replaceVideoEditorUrl(projectId: string, recordingId: string | null): void {
  window.history.replaceState({}, '', buildVideoEditorUrl(projectId, recordingId));
}
