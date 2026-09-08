import { WorkspacePreferencesProvider } from '../../runtime/controller/workspace-preferences';
import React, { useState } from 'react';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import {
  useVideoEditorCommandPaletteController,
  useVideoEditorHistoryController,
  useVideoEditorShellController,
} from '../../runtime/controller/composition/hooks';
import { VideoEditorCompositionProvider } from '../../runtime/controller/composition/provider';
import { VideoEditorWorkspace } from '../../workspace/surface';
import { VideoEditorCommandPalette } from '../command-palette';
import { VideoEditorStatusScreen } from '../status-screen';

/** Boots the single editor composition owner around a stable shell-gate child. */
export const App: React.FC = () => {
  usePageLocaleMetadata('videoEditor.app.documentTitle');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  return (
    <WorkspacePreferencesProvider>
      <VideoEditorCompositionProvider commandPaletteOpen={commandPaletteOpen}>
        <VideoEditorShellGate
          commandPaletteOpen={commandPaletteOpen}
          setCommandPaletteOpen={setCommandPaletteOpen}
        />
      </VideoEditorCompositionProvider>
    </WorkspacePreferencesProvider>
  );
};

export function VideoEditorShellGate(props: {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}): React.JSX.Element {
  const shell = useVideoEditorShellController();
  if (!shell.isReady) {
    return <VideoEditorStatusScreen mode="loading" />;
  }
  if (shell.error || !shell.project) {
    return <VideoEditorStatusScreen mode="error" error={shell.error ?? ''} />;
  }
  return <VideoEditorReadySurface {...props} />;
}

function VideoEditorReadySurface(props: {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}): React.JSX.Element {
  useCommandPaletteHotkey({
    isOpen: props.commandPaletteOpen,
    onOpen: () => props.setCommandPaletteOpen(true),
    onClose: () => props.setCommandPaletteOpen(false),
    enabled: true,
  });

  return (
    <div
      className={[
        'sniptale-extension-surface h-screen overflow-hidden text-[var(--sniptale-color-text-primary)]',
        'bg-[color:var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <VideoEditorWorkspace />
      <VideoEditorCommandPaletteContainer
        isOpen={props.commandPaletteOpen}
        onClose={() => props.setCommandPaletteOpen(false)}
      />
    </div>
  );
}

function VideoEditorCommandPaletteContainer(props: {
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const controller = useVideoEditorCommandPaletteController();
  const history = useVideoEditorHistoryController();
  return (
    <VideoEditorCommandPalette
      controller={controller}
      history={history}
      isOpen={props.isOpen}
      onClose={props.onClose}
    />
  );
}
