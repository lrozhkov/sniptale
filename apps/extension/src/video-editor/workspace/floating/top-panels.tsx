import { translate } from '../../../platform/i18n';
import { CanvasInsertToolPanel, CanvasWorkspaceToolPanel } from '@sniptale/ui/canvas-tools';
import { floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { buildVideoInsertActions, buildVideoWorkspaceActions } from './actions';

const INSERT_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center',
  'max-[1180px]:top-[4.75rem] max-[860px]:left-3 max-[860px]:right-3 max-[860px]:translate-x-0'
);

const WORKSPACE_STACK_CLASS_NAME = floatingChromeClassNames(
  'absolute right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center',
  'max-[860px]:top-[8rem] max-[860px]:left-3'
);

const TOP_PANEL_CLASS_NAME = floatingChromeClassNames(
  'flex-row items-center overflow-visible',
  '!bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_99%,var(--sniptale-color-surface-canvas)_1%)]',
  '!backdrop-blur-none',
  'max-[860px]:w-full max-[860px]:flex-wrap max-[860px]:gap-1'
);

export function VideoEditorFloatingInsertPanel(props: {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  controller: VideoEditorWorkspaceController;
  effectsLibraryDock: {
    isOpen: boolean;
    onToggle: () => void;
  };
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
}) {
  const insertion = props.controller.timeline.actions.insertion;

  return (
    <div data-ui="video-editor.floating.insert-panel.stack" className={INSERT_STACK_CLASS_NAME}>
      <CanvasInsertToolPanel
        actions={buildVideoInsertActions({
          activeInsertKind: props.activeInsertKind,
          effectsLibraryDock: props.effectsLibraryDock,
          insertion,
          onActiveInsertKindChange: props.onActiveInsertKindChange,
        })}
        className={TOP_PANEL_CLASS_NAME}
        dataUi="video-editor.floating.insert-panel"
        label={translate('videoEditor.timeline.addMenuTitle')}
      />
    </div>
  );
}

export function VideoEditorFloatingWorkspacePanel(props: {
  controller: VideoEditorWorkspaceController;
}) {
  return (
    <div
      data-ui="video-editor.floating.workspace-panel.stack"
      className={WORKSPACE_STACK_CLASS_NAME}
    >
      <CanvasWorkspaceToolPanel
        actions={buildVideoWorkspaceActions(props.controller)}
        className={TOP_PANEL_CLASS_NAME}
        dataUi="video-editor.floating.workspace-panel"
        label={translate('shared.ui.commandPaletteWorkspaceSection')}
      />
    </div>
  );
}
