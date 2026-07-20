import React from 'react';
import { ContentToolbarDragHandle, ContentToolbarShell } from '@sniptale/ui/content-toolbar';
import { ToolbarPrimaryControls } from '../controls/primary';
import { ToolbarSecondaryControls } from '../controls/secondary';
import type { useToolbarViewModel } from '../state/view-model';
import type { ToolbarProps } from '../types';
import { useToolbarEventDeliveryDiagnostics } from './event-diagnostics';

type ToolbarViewModel = ReturnType<typeof useToolbarViewModel>;

function getToolbarVisibilityStyle(positionReady: boolean, position: { x: number; y: number }) {
  return {
    top: `${position.y}px`,
    left: `${position.x}px`,
    visibility: positionReady ? 'visible' : 'hidden',
    pointerEvents: positionReady ? 'auto' : 'none',
    animation: positionReady ? undefined : 'none',
  } as const;
}

export function ToolbarShellContent(props: {
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
  onHoverCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
}) {
  const { toolbarProps, viewModel, onHoverCapture, onViewportChange } = props;
  const { derivedState } = viewModel;
  useToolbarEventDeliveryDiagnostics(derivedState.toolbarRef);

  return (
    <ContentToolbarShell
      ref={derivedState.toolbarRef}
      dragging={derivedState.isDragging}
      dataUi="content.toolbar.root"
      data-display-mode={derivedState.displayMode}
      style={getToolbarVisibilityStyle(derivedState.positionReady, derivedState.position)}
      onMouseOverCapture={onHoverCapture}
    >
      <ContentToolbarDragHandle onMouseDown={derivedState.handleMouseDown}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round">
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </ContentToolbarDragHandle>

      <ToolbarPrimaryControls toolbarProps={toolbarProps} viewModel={viewModel} />
      <ToolbarSecondaryControls
        toolbarProps={toolbarProps}
        viewModel={viewModel}
        onViewportChange={onViewportChange}
      />
    </ContentToolbarShell>
  );
}
