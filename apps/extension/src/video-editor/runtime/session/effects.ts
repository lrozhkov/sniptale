import type { VideoProject } from '../../../features/video/project/types/index';
import type { VideoEditorLibrariesState } from '../app-model/types';
import type { VideoEditorExportActions } from '../../contracts/commands/export';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import { replaceVideoEditorUrl } from '../browser-driver';
import { useVideoEditorAutoSave } from './auto-save';
import { useVideoEditorBootstrap } from './bootstrap';
import { useVideoEditorExportEvents } from './export-events';
import type { ApplyLoadedProject } from './types';

interface RuntimeEffectsParams {
  project: VideoProject | null;
  recordingId: string | null;
  getActiveExportJobId: () => string | null;
  setSaveState: VideoEditorSessionActions['setSaveState'];
  syncProjectRevision: VideoEditorSessionActions['updateProject'];
  libraries: VideoEditorLibrariesState;
  setError: VideoEditorSessionActions['setError'];
  setReady: VideoEditorSessionActions['setReady'];
  applyLoadedProject: ApplyLoadedProject;
  updateExportStatus: VideoEditorExportActions['updateExportStatus'];
  failExport: VideoEditorExportActions['failExport'];
  completeExport: VideoEditorExportActions['completeExport'];
  cancelExport: VideoEditorExportActions['cancelExport'];
}

export function createApplyLoadedProject(
  setProject: VideoEditorSessionActions['setProject'],
  setError: VideoEditorSessionActions['setError'],
  setDiagnosticsOpen: VideoEditorSessionActions['setDiagnosticsOpen']
): ApplyLoadedProject {
  return (project, recordingId) => {
    setProject(project, recordingId);
    setError(null);
    setDiagnosticsOpen(false);
    replaceVideoEditorUrl(project.id, recordingId);
  };
}

export function useVideoEditorRuntimeEffects({
  project,
  recordingId,
  getActiveExportJobId,
  setSaveState,
  syncProjectRevision,
  libraries,
  setError,
  setReady,
  applyLoadedProject,
  updateExportStatus,
  failExport,
  completeExport,
  cancelExport,
}: RuntimeEffectsParams): void {
  useVideoEditorBootstrap(
    applyLoadedProject,
    setError,
    setReady,
    libraries.refreshRecordings,
    libraries.refreshProjects,
    libraries.refreshProjectExports
  );

  useVideoEditorExportEvents({
    projectId: project?.id,
    getActiveExportJobId,
    setError,
    updateExportStatus,
    failExport,
    completeExport,
    cancelExport,
    refreshRecordings: libraries.refreshRecordings,
    refreshProjects: libraries.refreshProjects,
    refreshProjectExports: libraries.refreshProjectExports,
  });

  useVideoEditorAutoSave(
    project,
    recordingId,
    setSaveState,
    libraries.refreshProjects,
    syncProjectRevision
  );
}
