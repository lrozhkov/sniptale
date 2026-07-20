import React, { useState } from 'react';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { VideoEditorStatusScreen } from '../status-screen';
import { VideoEditorWorkspace } from '../../workspace/surface';
import { useVideoEditorController } from '../../runtime/controller';
import { VideoEditorCommandPalette } from '../command-palette';

/**
 * Boots the video editor entrypoint and delegates runtime work to focused hooks.
 */
export const App: React.FC = () => {
  usePageLocaleMetadata('videoEditor.app.documentTitle');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const controller = useVideoEditorController();
  const paletteEnabled = controller.shell.isReady && Boolean(controller.shell.project);

  useCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => setCommandPaletteOpen(true),
    onClose: () => setCommandPaletteOpen(false),
    enabled: paletteEnabled,
  });

  if (!controller.shell.isReady) {
    return <VideoEditorStatusScreen mode="loading" />;
  }

  if (controller.shell.error || !controller.shell.project) {
    return <VideoEditorStatusScreen mode="error" error={controller.shell.error ?? ''} />;
  }

  if (!controller.workspace) {
    return <VideoEditorStatusScreen mode="error" error={controller.shell.error ?? ''} />;
  }

  const readyController = {
    ...controller,
    workspace: controller.workspace,
  };

  return (
    <div
      className={[
        'sniptale-extension-surface h-screen overflow-hidden text-[var(--sniptale-color-text-primary)]',
        'bg-[color:var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <VideoEditorWorkspace controller={readyController} />
      <VideoEditorCommandPalette
        controller={controller.palette}
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
};
