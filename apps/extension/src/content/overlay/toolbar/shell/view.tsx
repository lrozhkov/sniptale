import { CommandPressScope } from '@sniptale/ui/control-language/press';
import React from 'react';
import { ToolbarDockingGuides } from './docking-guides';
import { ContentToolbarDragHandle, ContentToolbarShell } from '@sniptale/ui/content-toolbar';
import { ToolbarPrimaryControls } from '../controls/primary';
import { ToolbarSecondaryControls } from '../controls/secondary';
import type { useToolbarViewModel } from '../state/view-model';
import type { ToolbarProps } from '../types';
import { useToolbarEventDeliveryDiagnostics } from './event-diagnostics';
import { useContentUiScale } from '../../../platform/dom-host';
import {
  RecordingToolbarControlsContext,
  useRecordingToolbarControls,
} from '../state/recording-controls';
import { PageToolbarControlsContext, usePageToolbarControls } from '../state/page-controls';

type ToolbarViewModel = ReturnType<typeof useToolbarViewModel>;

function getCustomizationMode(toolbarProps: ToolbarProps, viewModel: ToolbarViewModel) {
  if (toolbarProps.drawingMode) return 'drawing';
  if (viewModel.designReviewMode) return 'design-review';
  if (viewModel.highlighterMode) return 'highlighter';
  if (viewModel.quickEditMode || toolbarProps.aiPickMode || toolbarProps.isCursorMode === false)
    return 'quick-edit';
  return 'cursor';
}

function getToolbarVisibilityStyle(
  positionReady: boolean,
  position: { x: number; y: number },
  uiScale: number
) {
  return {
    position: 'fixed',
    top: `${position.y * uiScale}px`,
    left: `${position.x * uiScale}px`,
    visibility: positionReady ? 'visible' : 'hidden',
    pointerEvents: positionReady ? 'auto' : 'none',
    animation: positionReady ? undefined : 'none',
  } as const;
}

function getPointerActivatedToolbarButton(event: React.MouseEvent<HTMLDivElement>) {
  if (event.button !== 0 || !(event.target instanceof Element)) return null;
  const button = event.target.closest<HTMLButtonElement>('button.sniptale-btn');
  return button && event.currentTarget.contains(button) && !button.disabled ? button : null;
}

function blurPointerActivatedToolbarFocus(event: React.MouseEvent<HTMLDivElement>) {
  const button = getPointerActivatedToolbarButton(event);
  if (button?.matches(':focus')) button.blur();
}

function preventPointerActivatedToolbarFocus(event: React.MouseEvent<HTMLDivElement>) {
  // Both native mousedown and the activation bridge focus after this handler unless cancelled.
  if (getPointerActivatedToolbarButton(event)) event.preventDefault();
}

function useCustomizationFocus(
  editing: boolean,
  recording: boolean | undefined,
  menuOpen: boolean,
  toolbarRef: ToolbarViewModel['derivedState']['toolbarRef']
) {
  const wasCustomizing = React.useRef(false);
  React.useLayoutEffect(() => {
    if (wasCustomizing.current && !editing && !recording && !menuOpen) {
      toolbarRef.current
        ?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.settings-button"]')
        ?.focus({ preventScroll: true });
    }
    wasCustomizing.current = editing;
  }, [editing, recording, toolbarRef, menuOpen]);
}

export function ToolbarShellContent(props: {
  toolbarProps: ToolbarProps;
  viewModel: ToolbarViewModel;
  onHoverCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
}) {
  const { toolbarProps, viewModel, onHoverCapture, onViewportChange } = props;
  const { derivedState } = viewModel;
  const [hasDragged, setHasDragged] = React.useState(false);
  const dragFocus = React.useRef<{ positioner: HTMLElement; previous: HTMLElement | null } | null>(
    null
  );
  React.useEffect(() => {
    if (derivedState.isDragging || !dragFocus.current) return;
    const { positioner, previous } = dragFocus.current;
    dragFocus.current = null;
    if (!positioner.matches(':focus')) return;
    positioner.blur();
    if (previous?.isConnected && !previous.closest('[inert]'))
      previous.focus({ preventScroll: true });
  }, [derivedState.isDragging]);
  const uiScale = useContentUiScale();
  const menuOpen = viewModel.toolbarMenuState.activeMenuType !== null;
  const pageControls = usePageToolbarControls(
    !toolbarProps.videoRecordingMode,
    getCustomizationMode(toolbarProps, viewModel)
  );
  useCustomizationFocus(
    pageControls.editing,
    toolbarProps.videoRecordingMode,
    menuOpen,
    derivedState.toolbarRef
  );
  const recordingControls = useRecordingToolbarControls(
    toolbarProps.videoRecordingMode ?? false,
    Boolean(
      toolbarProps.videoRecording &&
      toolbarProps.videoRecording.state.phase !== 'idle' &&
      toolbarProps.videoRecording.state.phase !== 'error'
    )
  );
  useToolbarEventDeliveryDiagnostics(derivedState.toolbarRef);

  return (
    <PageToolbarControlsContext.Provider
      value={toolbarProps.videoRecordingMode ? null : pageControls}
    >
      <RecordingToolbarControlsContext.Provider
        value={toolbarProps.videoRecordingMode ? recordingControls : null}
      >
        {derivedState.isDragging && !derivedState.freePlacement ? (
          <ToolbarDockingGuides activeEdge={derivedState.dockPreview} uiScale={uiScale} />
        ) : null}
        {menuOpen ? <div className="sniptale-toolbar-menu-interaction-guard" aria-hidden /> : null}
        <div
          className="sniptale-toolbar-positioner"
          tabIndex={-1}
          data-dragging={derivedState.isDragging ? 'true' : 'false'}
          data-drag-started={hasDragged ? 'true' : undefined}
          style={getToolbarVisibilityStyle(
            derivedState.positionReady,
            derivedState.position,
            uiScale
          )}
        >
          <CommandPressScope value={true}>
            <ContentToolbarShell
              ref={derivedState.toolbarRef}
              className="sniptale-content-ui-zoom-surface sniptale-content-toolbar-adopted"
              dragging={derivedState.isDragging}
              dataUi="content.toolbar.root"
              data-display-mode={derivedState.displayMode}
              data-menu-side={
                derivedState.displayMode === 'vertical'
                  ? derivedState.position.x * uiScale < window.innerWidth / 2
                    ? 'right'
                    : 'left'
                  : derivedState.position.y * uiScale < window.innerHeight / 2
                    ? 'down'
                    : 'up'
              }
              data-dock-dragging={
                derivedState.isDragging && !derivedState.freePlacement ? 'true' : undefined
              }
              inert={derivedState.isDragging && !derivedState.freePlacement}
              data-video-recording={toolbarProps.videoRecordingMode ? 'true' : undefined}
              data-page-controls={toolbarProps.videoRecordingMode ? undefined : 'true'}
              data-recording-fade={
                toolbarProps.videoRecordingMode &&
                recordingControls.ready &&
                recordingControls.fadeDuringRecording &&
                toolbarProps.videoRecording?.state.phase === 'recording'
                  ? 'true'
                  : undefined
              }
              data-menu-open={menuOpen ? 'true' : undefined}
              onPointerDownCapture={blurPointerActivatedToolbarFocus}
              onMouseDownCapture={preventPointerActivatedToolbarFocus}
              onMouseOverCapture={onHoverCapture}
            >
              <ContentToolbarDragHandle
                onPointerDown={(event) => {
                  if (!derivedState.freePlacement) {
                    const positioner = event.currentTarget.closest<HTMLElement>(
                      '.sniptale-toolbar-positioner'
                    );
                    if (positioner) {
                      const root = positioner.getRootNode();
                      const focused =
                        root instanceof ShadowRoot ? root.activeElement : document.activeElement;
                      dragFocus.current = {
                        positioner,
                        previous:
                          focused instanceof HTMLElement && focused !== positioner ? focused : null,
                      };
                      positioner.focus({ preventScroll: true });
                    }
                  }
                  setHasDragged(true);
                  derivedState.handleMouseDown(event);
                }}
              >
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
          </CommandPressScope>
        </div>
      </RecordingToolbarControlsContext.Provider>
    </PageToolbarControlsContext.Provider>
  );
}
