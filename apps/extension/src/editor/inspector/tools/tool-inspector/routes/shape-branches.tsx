import { useEditorStore } from '../../../../state/useEditorStore';
import { ShapeBrowser, type ShapeBrowserEntry } from '../../shape-browser';
import { useShapeBrowserCustomShapes } from '../../shape-browser/custom-shapes';

export function renderShapesAndLinesBranch() {
  return (
    <ShapeToolBranch
      key="shapes-and-lines"
      onSelectShape={(entry) => selectShapeForDrawing(entry, false)}
    />
  );
}

function ShapeToolBranch(props: { onSelectShape: (entry: ShapeBrowserEntry) => void }) {
  const customShapes = useShapeBrowserCustomShapes();
  const selectedEntryId = useEditorStore((state) => state.richShapeToolSelection?.shapeId ?? null);
  return (
    <div className="space-y-3">
      <ShapeBrowser
        additionalEntries={customShapes.entries}
        defaultSourceFilter="all"
        excludedCategories={[]}
        importState={customShapes.importState}
        selectedEntryId={selectedEntryId}
        showPrimaryShortcuts={false}
        showSourceFilters={false}
        sourceFilters={['all', 'built-in', 'imported-library', 'custom']}
        onDeleteCustomShape={(entry) => {
          void customShapes.deleteShape(entry.id);
        }}
        onDisableCustomShape={(entry) => {
          void customShapes.disableShape(entry.id);
        }}
        onImportFile={(file) => {
          void customShapes.importFile(file);
        }}
        onSelect={props.onSelectShape}
      />
    </div>
  );
}

function selectShapeForDrawing(entry: ShapeBrowserEntry, rough: boolean): void {
  useEditorStore.getState().setRichShapeToolSelection({
    shapeId: entry.id,
    ...(entry.customDefinition ? { customDefinition: entry.customDefinition } : {}),
    rough,
  });
}
