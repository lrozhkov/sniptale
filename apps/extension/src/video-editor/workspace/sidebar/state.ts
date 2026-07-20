import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
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
  diagnosticsMeta: string;
  projectsOpen: boolean;
  recordingsOpen: boolean;
  diagnosticsSectionOpen: boolean;
  toggleProjectsOpen: () => void;
  toggleRecordingsOpen: () => void;
  toggleDiagnosticsSection: () => void;
}

export function useWorkspaceSidebarState(
  selection: VideoEditorSelection | null | undefined = createSceneSelection(),
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  recordingId: string | null,
  diagnosticsOpen: boolean,
  onToggleDiagnostics: (open: boolean) => void = () => undefined
): WorkspaceSidebarViewState {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(true);

  const selectionMeta = getSelectionMeta(selection ?? createSceneSelection(), selectedClip);

  return {
    inputRefs: {
      imageInputRef,
      videoInputRef,
      audioInputRef,
    },
    selectionIcon: selectionMeta.icon,
    selectionLabel: selectionMeta.label,
    selectionTitle: useMemo(() => selectionMeta.title, [selectionMeta]),
    diagnosticsMeta: recordingId
      ? translate('videoEditor.sidebar.diagnosticsAttached')
      : translate('videoEditor.sidebar.diagnosticsMissing'),
    projectsOpen,
    recordingsOpen,
    diagnosticsSectionOpen: diagnosticsOpen,
    toggleProjectsOpen: () => setProjectsOpen((value) => !value),
    toggleRecordingsOpen: () => setRecordingsOpen((value) => !value),
    toggleDiagnosticsSection: () => onToggleDiagnostics(!diagnosticsOpen),
  };
}
