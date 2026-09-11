import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import type { VideoEditorFileInputRefs } from '../../chrome/file-inputs';
import { createSceneSelection } from '../../project/selection/model';
import type { VideoEditorSelection } from '../../contracts/selection';
import type { WorkspaceSidebarProps } from './contracts/index';
import { getSelectionMeta } from './view';

interface WorkspaceSidebarViewState {
  inputRefs: VideoEditorFileInputRefs;
  selectionIcon: React.ReactNode;
  selectionLabel: string;
  selectionTitle: string;
  projectsOpen: boolean;
  recordingsOpen: boolean;
  toggleProjectsOpen: () => void;
  toggleRecordingsOpen: () => void;
}

export function useWorkspaceSidebarState(
  selection: VideoEditorSelection | null | undefined = createSceneSelection(),
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrack?: WorkspaceSidebarProps['selectedTrack'],
  project?: WorkspaceSidebarProps['project']
): WorkspaceSidebarViewState {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(true);

  const selectionMeta = getSelectionMeta(
    selection ?? createSceneSelection(),
    selectedClip,
    selectedTrack,
    project
  );

  return {
    inputRefs: {
      imageInputRef,
      videoInputRef,
      audioInputRef,
    },
    selectionIcon: selectionMeta.icon,
    selectionLabel: selectionMeta.label,
    selectionTitle: useMemo(() => selectionMeta.title, [selectionMeta]),
    projectsOpen,
    recordingsOpen,
    toggleProjectsOpen: () => setProjectsOpen((value) => !value),
    toggleRecordingsOpen: () => setRecordingsOpen((value) => !value),
  };
}
