import type React from 'react';
import { EDITOR_BUILT_IN_SHAPE_CATEGORY } from '../../../../../features/editor/document/rich-shape';
import { useEditorStore } from '../../../../state/useEditorStore';
import { ShapeBrowser, type ShapeBrowserEntry } from '../../shape-browser';
import { useShapeBrowserCustomShapes } from '../../shape-browser/custom-shapes';

export function renderRoughShapeBranch() {
  return (
    <ShapeToolBranch
      key="rough-shape"
      defaultSourceFilter="built-in"
      excludedCategories={[
        EDITOR_BUILT_IN_SHAPE_CATEGORY.LINES,
        EDITOR_BUILT_IN_SHAPE_CATEGORY.ACTION_BUTTONS,
      ]}
      onSelectShape={(entry) => selectShapeForDrawing(entry, true)}
      showSourceFilters={false}
      sourceFilters={['built-in', 'imported-library', 'custom']}
      controls={null}
    />
  );
}

export function renderShapesAndLinesBranch() {
  return (
    <ShapeToolBranch
      key="shapes-and-lines"
      defaultSourceFilter="all"
      excludedCategories={[EDITOR_BUILT_IN_SHAPE_CATEGORY.LINES]}
      onSelectShape={(entry) => selectShapeForDrawing(entry, false)}
      showPrimaryShortcuts={false}
      showSourceFilters={false}
      sourceFilters={['all', 'built-in', 'imported-library', 'custom']}
      controls={null}
    />
  );
}

function ShapeToolBranch(props: {
  controls: React.ReactNode;
  defaultSourceFilter?: React.ComponentProps<typeof ShapeBrowser>['defaultSourceFilter'];
  excludedCategories?: React.ComponentProps<typeof ShapeBrowser>['excludedCategories'];
  onSelectShape: (entry: ShapeBrowserEntry) => void;
  showImport?: boolean;
  showPrimaryShortcuts?: boolean;
  showSourceFilters?: boolean;
  sourceFilters?: React.ComponentProps<typeof ShapeBrowser>['sourceFilters'];
}) {
  const customShapes = useShapeBrowserCustomShapes();
  const selectedEntryId = useEditorStore((state) => state.richShapeToolSelection?.shapeId ?? null);
  return (
    <div className="space-y-3">
      <ShapeBrowser
        additionalEntries={customShapes.entries}
        {...(props.defaultSourceFilter ? { defaultSourceFilter: props.defaultSourceFilter } : {})}
        {...(props.excludedCategories ? { excludedCategories: props.excludedCategories } : {})}
        importState={customShapes.importState}
        selectedEntryId={selectedEntryId}
        {...(props.showImport === undefined ? {} : { showImport: props.showImport })}
        {...(props.showPrimaryShortcuts === undefined
          ? {}
          : { showPrimaryShortcuts: props.showPrimaryShortcuts })}
        {...(props.showSourceFilters === undefined
          ? {}
          : { showSourceFilters: props.showSourceFilters })}
        {...(props.sourceFilters ? { sourceFilters: props.sourceFilters } : {})}
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
      {props.controls}
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
