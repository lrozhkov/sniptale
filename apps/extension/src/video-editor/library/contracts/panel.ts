import type { ReactNode } from 'react';

import type { VideoEditorFileInputRefs } from '../../chrome/file-inputs';
import type { ProjectListItem, RecordingListItem } from './items';

export interface VideoEditorLibraryPanelProps {
  activeProjectId: string;
  diagnosticsContent: ReactNode;
  diagnosticsOpen: boolean;
  isOpen: boolean;
  onAddRecording: (recordingId: string) => void;
  onClose: () => void;
  onCreateProject: () => void | Promise<void>;
  onDeleteProject: (projectId: string) => void | Promise<void>;
  onImportAudio: (file: File) => void;
  onImportImage: (file: File) => void;
  onImportVideo: (file: File) => void;
  onOpenAudioRecordingDialog: () => void;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onToggleDiagnostics: (open: boolean) => void;
  projects: ProjectListItem[];
  recordingId: string | null;
  recordings: RecordingListItem[];
}

export interface VideoEditorLibraryPanelBodyProps extends Omit<
  VideoEditorLibraryPanelProps,
  'isOpen'
> {
  inputRefs: VideoEditorFileInputRefs;
}
