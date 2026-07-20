import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { useEditorEmbedContext } from '../../application/embed-context/context';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorToolbarContentProps } from './types';
import { EditorToolbarDivider } from './shared';
import { EditorToolbarWorkspaceSection, EditorToolbarZoomSection } from './sections';

interface EditorToolbarTrailingControlsProps {
  gridEnabled: EditorToolbarContentProps['gridEnabled'];
  hasImage: EditorToolbarContentProps['hasImage'];
  inspector: EditorToolbarContentProps['inspector'];
  onBeforeSelectionAwareAction: EditorToolbarContentProps['onBeforeSelectionAwareAction'];
  viewportPreviewOpen: EditorToolbarContentProps['viewportPreviewOpen'];
  zoomPercent: EditorToolbarContentProps['zoomPercent'];
  onSetViewportPreviewOpenManually: EditorToolbarContentProps['onSetViewportPreviewOpenManually'];
  onToggleInspector: EditorToolbarContentProps['onToggleInspector'];
}

function EditorToolbarScenarioApplyAction(props: {
  hasImage: boolean;
  onBeforeSelectionAwareAction: () => void;
  onApply: (() => Promise<void>) | null | undefined;
}) {
  const controller = useEditorController();

  if (!props.hasImage || !props.onApply) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          fireAndReportEditorAction('toolbar-apply-to-scenario', async () => {
            props.onBeforeSelectionAwareAction();
            controller.clearSelection();
            await props.onApply?.();
          })
        }
        className="mr-3 inline-flex rounded-full border border-[var(--sniptale-color-border-accent-strong)]
          bg-[var(--sniptale-color-accent-soft)] px-3 py-2 text-xs font-semibold
          text-[var(--sniptale-color-text-primary)]"
      >
        {translate('editor.documentActions.applyToScenario')}
      </button>
      <EditorToolbarDivider />
    </>
  );
}

export function EditorToolbarTrailingControls(props: EditorToolbarTrailingControlsProps) {
  const embed = useEditorEmbedContext();
  const magnetEnabled = useEditorStore((state) => state.workspace.magnetEnabled);
  const updateWorkspace = useEditorStore((state) => state.updateWorkspace);

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      {embed.mode === 'scenario' ? (
        <EditorToolbarScenarioApplyAction
          hasImage={props.hasImage}
          onApply={embed.onApply}
          onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
        />
      ) : null}

      <EditorToolbarWorkspaceSection
        gridEnabled={props.gridEnabled}
        hasImage={props.hasImage}
        inspector={props.inspector}
        magnetEnabled={magnetEnabled}
        viewportPreviewOpen={props.viewportPreviewOpen}
        onToggleGrid={() => props.onToggleInspector('grid')}
        onToggleMagnet={() => updateWorkspace({ magnetEnabled: !magnetEnabled })}
        onToggleViewportPreview={() =>
          props.onSetViewportPreviewOpenManually(!props.viewportPreviewOpen)
        }
        onToggleWorkspace={() => props.onToggleInspector('workspace')}
      />

      <EditorToolbarDivider />

      <EditorToolbarZoomSection hasImage={props.hasImage} zoomPercent={props.zoomPercent} />
    </div>
  );
}
