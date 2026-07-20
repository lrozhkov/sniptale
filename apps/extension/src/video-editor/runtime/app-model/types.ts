import type { ProjectExportEntry } from '../../../composition/persistence/projects/contracts';

interface RecordingListItem {
  id: string;
  filename: string;
  createdAt: number;
  size: number;
  mimeType: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  thumbnailId: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  duration: number;
  updatedAt: number;
  createdAt: number;
  width: number;
  height: number;
  clipCount: number;
  trackCount: number;
  thumbnailId: string;
  thumbnailSourceMediaId: string | null;
}

export interface SaveStateMeta {
  label: string;
  className: string;
}

export interface VideoEditorLibrariesState {
  recordings: RecordingListItem[];
  projects: ProjectListItem[];
  projectExports: ProjectExportEntry[];
  refreshRecordings: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshProjectExports: (projectId: string | null) => Promise<void>;
}
