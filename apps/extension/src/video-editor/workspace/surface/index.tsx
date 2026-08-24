import React from 'react';

import { translate } from '../../../platform/i18n';
import {
  useVideoEditorDiagnosticsController,
  useVideoEditorLayoutController,
  useVideoEditorOverlaysController,
} from '../../runtime/controller/composition/hooks';
import { DiagnosticsPanel } from '../../diagnostics/panel';
import { VideoEditorWorkspaceMain } from './main';
import { VideoEditorWorkspaceOverlays } from './overlays';

function useDiagnosticsContent(): React.ReactNode {
  const diagnostics = useVideoEditorDiagnosticsController();
  if (diagnostics.isOpen && diagnostics.recordingId) {
    return <DiagnosticsPanel recordingId={diagnostics.recordingId} onClose={diagnostics.onClose} />;
  }
  return (
    <div
      className={[
        'rounded-[16px] border border-dashed',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:var(--sniptale-color-surface-panel)]',
        'px-3 py-4 text-sm text-[var(--sniptale-color-text-muted)]',
      ].join(' ')}
    >
      {translate('videoEditor.app.diagnosticsClosedHint')}
    </div>
  );
}

export function VideoEditorWorkspace(): React.JSX.Element {
  const layout = useVideoEditorLayoutController();
  const overlays = useVideoEditorOverlaysController();
  const diagnosticsContent = useDiagnosticsContent();
  const previewHeightStyle = layout.previewPaneHeight
    ? { height: `${layout.previewPaneHeight}px` }
    : { height: '60%' };

  return (
    <div
      data-ui="video-editor.workspace.root"
      className={[
        'flex h-screen min-h-0 overflow-hidden',
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
      <VideoEditorWorkspaceMain
        diagnosticsContent={diagnosticsContent}
        previewHeightStyle={previewHeightStyle}
      />
    </div>
  );
}
