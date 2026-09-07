import React from 'react';

import {
  useVideoEditorLayoutController,
  useVideoEditorOverlaysController,
} from '../../runtime/controller/composition/hooks';
import { VideoEditorWorkspaceMain } from './main';
import { VideoEditorWorkspaceOverlays } from './overlays';

export function VideoEditorWorkspace(): React.JSX.Element {
  const layout = useVideoEditorLayoutController();
  const overlays = useVideoEditorOverlaysController();
  const previewHeightStyle = layout.previewPaneHeight
    ? { height: `${layout.previewPaneHeight}px` }
    : { height: '60%' };

  return (
    <div
      data-ui="video-editor.workspace.root"
      className={[
        'flex h-screen min-h-0 overflow-x-auto overflow-y-hidden',
        'bg-transparent',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <div
        data-ui="video-editor.workspace.backdrop"
        className={[
          'pointer-events-none fixed inset-0',
          'bg-[color:var(--sniptale-color-surface-canvas)]',
        ].join(' ')}
      />
      <VideoEditorWorkspaceOverlays controller={overlays} />
      <VideoEditorWorkspaceMain previewHeightStyle={previewHeightStyle} />
    </div>
  );
}
