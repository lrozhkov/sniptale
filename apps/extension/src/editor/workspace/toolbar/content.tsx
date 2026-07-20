import { EditorToolbarInspectorSummary } from './inspector-summary';
import { EditorToolbarTrailingControls } from './trailing-controls';
import { EditorToolbarDivider, EditorToolbarShell, EditorToolbarUndoSection } from './shared';
import {
  EditorToolbarCanvasSection,
  EditorToolbarPrimarySection,
  EditorToolbarRasterSection,
} from './sections';
import type { EditorToolbarContentProps } from './types';

function EditorToolbarPrimaryRow(props: EditorToolbarContentProps) {
  return (
    <div
      data-testid="toolbar-primary-row"
      className="flex min-w-0 flex-wrap items-center gap-y-1 xl:min-w-0 xl:flex-1"
    >
      <EditorToolbarPrimarySection
        activeInspector={props.inspector}
        activeTool={props.activeTool}
        hasImage={props.hasImage}
        isToolButtonActive={props.isToolButtonActive}
        onActivateTool={props.onActivateTool}
        onToggleInspector={props.onToggleInspector}
      />

      <EditorToolbarDivider />

      <EditorToolbarRasterSection
        hasImage={props.hasImage}
        isToolButtonActive={props.isToolButtonActive}
        onActivateTool={props.onActivateTool}
      />

      <EditorToolbarDivider />

      <EditorToolbarCanvasSection
        hasImage={props.hasImage}
        isCropActive={props.isToolMode && props.activeTool === 'crop'}
        onActivateCrop={() => props.onActivateTool('crop')}
      />

      <EditorToolbarDivider />

      <EditorToolbarUndoSection
        hasImage={props.hasImage}
        history={props.history}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
      />
    </div>
  );
}

function EditorToolbarSecondaryRow(props: EditorToolbarContentProps) {
  return (
    <div data-testid="toolbar-secondary-row" className="flex min-w-0 xl:ml-auto xl:justify-end">
      <EditorToolbarTrailingControls
        gridEnabled={props.gridEnabled}
        hasImage={props.hasImage}
        inspector={props.inspector}
        viewportPreviewOpen={props.viewportPreviewOpen}
        zoomPercent={props.zoomPercent}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
        onSetViewportPreviewOpenManually={props.onSetViewportPreviewOpenManually}
        onToggleInspector={props.onToggleInspector}
      />
    </div>
  );
}

function EditorToolbarMainSections(props: EditorToolbarContentProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2 sm:px-4 xl:flex-row xl:items-center xl:gap-2">
      <EditorToolbarPrimaryRow {...props} />
      <EditorToolbarSecondaryRow {...props} />
    </div>
  );
}

export function EditorToolbarContent(props: EditorToolbarContentProps) {
  return (
    <EditorToolbarShell>
      <EditorToolbarInspectorSummary
        inspectorCollapsed={props.inspectorCollapsed}
        subtitle={props.inspectorMeta.subtitle}
        title={props.inspectorMeta.title}
        onCollapse={props.onCollapseInspector}
        onExpand={props.onExpandInspector}
      />
      <EditorToolbarMainSections {...props} />
    </EditorToolbarShell>
  );
}
