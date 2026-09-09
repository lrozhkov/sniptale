import type { VideoEditorProjectHistoryTransactionActions } from '../../contracts/commands/history';
import type { VideoProject } from '../../../features/video/project/types/index';
import type {
  VideoEditorImportPlacement,
  VideoEditorAudioRecordingTarget,
} from '../../contracts/insertion';
import type { VideoEditorExportRuntimeState } from '../../contracts/export-state';
import type { VideoEditorExportActions } from '../../contracts/commands/export';
import type { VideoEditorProjectActions } from '../../contracts/commands/project';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import type { VideoEditorLibrariesState, ProjectListItem } from '../app-model/types';
import type { ApplyLoadedProject } from '../session/types';

export interface VideoEditorActionHandlers {
  handleOpenProject: (projectId: string) => Promise<void>;
  handleCreateProject: () => Promise<void>;
  handleDeleteProject: (projectId: string) => Promise<void>;
  handleAddRecording: (recordingId: string) => Promise<void>;
  handleAddLibraryMedia: (mediaId: string) => Promise<void>;
  handleImportImage: (file: File, placement?: VideoEditorImportPlacement) => Promise<void>;
  handleImportVideo: (file: File, placement?: VideoEditorImportPlacement) => Promise<void>;
  handleImportAudio: (file: File, placement?: VideoEditorImportPlacement) => Promise<void>;
  handleImportRecordedAudio: (
    file: File,
    trim: { trimEnd: number; trimStart: number },
    target?: VideoEditorAudioRecordingTarget | null
  ) => Promise<void>;
  handleStartExport: () => Promise<void>;
  handleCancelExport: () => Promise<void>;
}

interface VideoEditorCommandErrorPort {
  setError: VideoEditorSessionActions['setError'];
}

export interface AssetHandlerPort
  extends
    VideoEditorCommandErrorPort,
    Pick<
      VideoEditorProjectHistoryTransactionActions,
      'beginProjectHistoryTransaction' | 'endProjectHistoryTransaction'
    > {
  getCurrentProject: () => VideoProject | null;
  getCurrentProjectId: () => string | null;
  getCurrentTime: () => number;
  updateProject: VideoEditorSessionActions['updateProject'];
  upsertAsset: VideoEditorProjectActions['upsertAsset'];
  upsertAssets: VideoEditorProjectActions['upsertAssets'];
  addAssetClip: VideoEditorProjectActions['addAssetClip'];
  moveClip: VideoEditorProjectActions['moveClip'];
  trimClipEnd: VideoEditorProjectActions['trimClipEnd'];
  trimClipStart: VideoEditorProjectActions['trimClipStart'];
}

export interface ExportHandlerPort {
  getCurrentProject: () => VideoProject | null;
  getCurrentSelectedClipId: () => string | null;
  getCurrentExportState: () => VideoEditorExportRuntimeState;
  startExport: VideoEditorExportActions['startExport'];
  failExport: VideoEditorExportActions['failExport'];
  failExportCancellation: VideoEditorExportActions['failExportCancellation'];
  cancelExport: VideoEditorExportActions['cancelExport'];
}

export interface ProjectHandlerPort extends VideoEditorCommandErrorPort {
  getCurrentProject: () => VideoProject | null;
  projects: ProjectListItem[];
  libraries: Pick<VideoEditorLibrariesState, 'refreshProjectExports' | 'refreshProjects'>;
  applyLoadedProject: ApplyLoadedProject;
}

export interface VideoEditorCommandHandlers {
  assets: Pick<
    VideoEditorActionHandlers,
    | 'handleAddRecording'
    | 'handleAddLibraryMedia'
    | 'handleImportAudio'
    | 'handleImportImage'
    | 'handleImportRecordedAudio'
    | 'handleImportVideo'
  >;
  export: Pick<VideoEditorActionHandlers, 'handleStartExport' | 'handleCancelExport'>;
  project: Pick<
    VideoEditorActionHandlers,
    'handleOpenProject' | 'handleCreateProject' | 'handleDeleteProject'
  >;
}
