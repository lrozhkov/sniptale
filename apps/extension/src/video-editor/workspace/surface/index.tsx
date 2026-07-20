import React from 'react';

import { translate } from '../../../platform/i18n';
import type { ReadyVideoEditorController } from '../../runtime/controller/contracts/surface';
import { DiagnosticsPanel } from '../../diagnostics/panel';
import { VideoEditorWorkspaceMain } from './main';
import { VideoEditorWorkspaceOverlays } from './overlays';

interface VideoEditorWorkspaceProps {
  controller: ReadyVideoEditorController;
}

function renderDiagnosticsContent(
  controller: ReadyVideoEditorController['workspace']
): React.ReactNode {
  if (controller.diagnostics.isOpen && controller.diagnostics.recordingId) {
    return (
      <DiagnosticsPanel
        recordingId={controller.diagnostics.recordingId}
        onClose={controller.diagnostics.onClose}
      />
    );
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

export function VideoEditorWorkspace({ controller }: VideoEditorWorkspaceProps): React.JSX.Element {
  const previewHeightStyle = controller.workspace.layout.previewPaneHeight
    ? { height: `${controller.workspace.layout.previewPaneHeight}px` }
    : { height: '60%' };
  const diagnosticsContent = renderDiagnosticsContent(controller.workspace);

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
      <VideoEditorWorkspaceOverlays controller={controller.overlays} />
      <VideoEditorWorkspaceMain
        controller={{
          ...controller.workspace,
          sidebar: {
            ...controller.workspace.sidebar,
            state: {
              ...controller.workspace.sidebar.state,
              diagnosticsContent,
            },
          },
        }}
        previewHeightStyle={previewHeightStyle}
      />
    </div>
  );
}
